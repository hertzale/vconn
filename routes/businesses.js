const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');
const genID   = require('../config/idGen');

const router = express.Router();

// ── GET /api/businesses ─────────────────────────────────────────
// list all active businesses with their vehicles.
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius_km = 10, type } = req.query;

    let sql = `
      SELECT
        b.*,
        p.Name            AS Owner_Name,
        p.Contact_Number  AS Owner_Contact,
        COUNT(v.Vehicle_ID)                                         AS Vehicle_Count,
        GROUP_CONCAT(DISTINCT v.Vehicle_Type)                       AS Vehicle_Types,
        MIN(v.Daily_Rate)                                           AS Min_Rate,
        MAX(v.Daily_Rate)                                           AS Max_Rate
      FROM BUSINESS b
      JOIN PERSON p ON b.Owner_Account_ID = p.Account_ID
      LEFT JOIN VEHICLE v
        ON v.Business_ID = b.Business_ID
       AND v.Vehicle_Status = 'Available'
      WHERE b.Is_Active = 1`;

    const params = [];

    // Filter by vehicle type
    if (type) {
      sql += ` AND v.Vehicle_Type = ?`;
      params.push(type);
    }

    sql += ` GROUP BY b.Business_ID ORDER BY b.Business_Name`;

    let [rows] = await pool.query(sql, params);

    // If lat/lng provided, compute distance and filter in JS
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const R = 6371; // Earth radius km

      rows = rows
        .map(b => {
          if (!b.Latitude || !b.Longitude) return { ...b, Distance_KM: null };
          const dLat = ((b.Latitude  - userLat) * Math.PI) / 180;
          const dLng = ((b.Longitude - userLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((userLat * Math.PI) / 180) *
            Math.cos((b.Latitude * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return { ...b, Distance_KM: parseFloat(dist.toFixed(2)) };
        })
        .filter(b => b.Distance_KM === null || b.Distance_KM <= parseFloat(radius_km))
        .sort((a, b) => (a.Distance_KM ?? 9999) - (b.Distance_KM ?? 9999));
    }

    // Attach vehicles to each business row
  const bizIds = rows.map(b => b.Business_ID);
  let vehicles = [];
  if (bizIds.length > 0) {
    const placeholders = bizIds.map(() => '?').join(',');
    const [vRows] = await pool.query(
      `SELECT v.*, p.Address AS Owner_Address
      FROM VEHICLE v
      JOIN PERSON p ON v.Owner_Account_ID = p.Account_ID
      WHERE v.Business_ID IN (${placeholders})
        AND v.Vehicle_Status = 'Available'`,
      bizIds
    );
    vehicles = vRows;
  }

  const data = rows.map(biz => ({
    ...biz,
    vehicles: vehicles.filter(v => v.Business_ID === biz.Business_ID),
  }));

  res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/businesses/mine ────────────────────────────────────
// Owner business profile
router.get('/mine', auth, async (req, res) => {
  try {
    const [[biz]] = await pool.query(
      `SELECT b.*, p.Name AS Owner_Name, p.Email AS Owner_Email
       FROM BUSINESS b
       JOIN PERSON p ON b.Owner_Account_ID = p.Account_ID
       WHERE b.Owner_Account_ID = ?`,
      [req.user.account_id]
    );
    if (!biz) return res.status(404).json({ success: false, message: 'No business registered yet.' });
    res.json({ success: true, data: biz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/businesses/:id ─────────────────────────────────────
// all vehicles and photos
router.get('/:id', async (req, res) => {
  try {
    const [[biz]] = await pool.query(
      `SELECT b.*, p.Name AS Owner_Name, p.Contact_Number AS Owner_Contact
       FROM BUSINESS b
       JOIN PERSON p ON b.Owner_Account_ID = p.Account_ID
       WHERE b.Business_ID = ? AND b.Is_Active = 1`,
      [req.params.id]
    );
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found.' });

    const [vehicles] = await pool.query(
      `SELECT v.*,
              COALESCE(
                (SELECT Photo_URL FROM VEHICLE_PHOTO
                 WHERE Vehicle_ID = v.Vehicle_ID AND Is_Primary = 1 LIMIT 1),
                NULL
              ) AS Primary_Photo,
              AVG(f.Score)   AS Avg_Rating,
              COUNT(f.Feedback_ID) AS Review_Count
       FROM VEHICLE v
       LEFT JOIN FEEDBACK f ON f.Vehicle_ID = v.Vehicle_ID
       WHERE v.Business_ID = ?
       GROUP BY v.Vehicle_ID`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...biz, vehicles } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/businesses ────────────────────────────────────────
// Register a new business 
router.post('/', auth, async (req, res) => {
  const {
    business_name, business_address, description,
    contact_number, email, operating_hours,
    latitude, longitude, owner_type
  } = req.body;

  if (!business_name || !business_address) {
    return res.status(400).json({ success: false, message: 'business_name and business_address are required.' });
  }

  const validTypes = ['owner', 'owner-driver', 'driver'];
  if (owner_type && !validTypes.includes(owner_type)) {
    return res.status(400).json({ success: false, message: 'owner_type must be owner, owner-driver, or driver.' });
  }

  try {
    // One business per account
    const [[existing]] = await pool.query(
      `SELECT Business_ID FROM BUSINESS WHERE Owner_Account_ID = ?`,
      [req.user.account_id]
    );
    if (existing) return res.status(409).json({ success: false, message: 'You already have a registered business.' });

    const bizID = await genID('BUSINESS');
    const today = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO BUSINESS
         (Business_ID, Owner_Account_ID, Business_Name, Business_Address,
          Description, Contact_Number, Email, Operating_Hours,
          Latitude, Longitude, Owner_Type, Created_Date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        bizID, req.user.account_id, business_name, business_address,
        description || null, contact_number || null, email || null,
        operating_hours || null, latitude || null, longitude || null,
        owner_type || 'owner', today
      ]
    );

    // Update Owner_Type on PERSON record too
    if (owner_type) {
      await pool.query(
        `UPDATE PERSON SET Owner_Type = ? WHERE Account_ID = ?`,
        [owner_type, req.user.account_id]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Business registered!',
      data: { business_id: bizID }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── PUT /api/businesses/:id ─────────────────────────────────────
// update business info
router.put('/:id', auth, async (req, res) => {
  try {
    const [[biz]] = await pool.query(
      `SELECT Owner_Account_ID FROM BUSINESS WHERE Business_ID = ?`,
      [req.params.id]
    );
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found.' });
    if (biz.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Not your business.' });

    const {
      business_name, business_address, description,
      contact_number, email, operating_hours,
      latitude, longitude
    } = req.body;

    await pool.query(
      `UPDATE BUSINESS SET
         Business_Name = ?, Business_Address = ?, Description = ?,
         Contact_Number = ?, Email = ?, Operating_Hours = ?,
         Latitude = ?, Longitude = ?
       WHERE Business_ID = ?`,
      [
        business_name, business_address, description || null,
        contact_number || null, email || null, operating_hours || null,
        latitude || null, longitude || null, req.params.id
      ]
    );
    res.json({ success: true, message: 'Business updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── PATCH /api/businesses/:id/deactivate ───────────────────────
router.patch('/:id/deactivate', auth, async (req, res) => {
  try {
    const [[biz]] = await pool.query(
      `SELECT Owner_Account_ID FROM BUSINESS WHERE Business_ID = ?`,
      [req.params.id]
    );
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found.' });
    if (biz.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Not your business.' });

    await pool.query(
      `UPDATE BUSINESS SET Is_Active = 0 WHERE Business_ID = ?`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Business deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/businesses/:id/vehicles
router.get('/:id/vehicles', async (req, res) => {
  try {
    const [vehicles] = await pool.query(
      `SELECT v.*,
              AVG(f.Score)             AS Avg_Rating,
              COUNT(f.Feedback_ID)     AS Review_Count
       FROM VEHICLE v
       LEFT JOIN FEEDBACK f ON f.Vehicle_ID = v.Vehicle_ID
       WHERE v.Owner_Account_ID = (
         SELECT Owner_Account_ID FROM BUSINESS
         -- fallback: match by Business_ID column if it exists, else match by Account_ID
         WHERE Business_ID = ? OR Owner_Account_ID = ?
         LIMIT 1
       )
       GROUP BY v.Vehicle_ID`,
      [req.params.id, req.params.id]
    );
    res.json({ success: true, data: vehicles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
