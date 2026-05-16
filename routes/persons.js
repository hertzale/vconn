const express = require('express');
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

const router = express.Router();

// List all persons who own at least one vehicle (used by BusinessListPage)
router.get('/owners', async (req, res) => {
  try {
    const [owners] = await pool.query(
      `SELECT
         p.Account_ID, p.Name, p.Address, p.Contact_Number, p.Email,
         b.Business_ID, b.Business_Name, b.Latitude, b.Longitude
       FROM PERSON p
       INNER JOIN VEHICLE v ON v.Owner_Account_ID = p.Account_ID
       LEFT JOIN BUSINESS b ON b.Owner_Account_ID = p.Account_ID AND b.Is_Active = 1
       GROUP BY p.Account_ID`
    );

    // Attach vehicles to each owner
    const ownerIds = owners.map(o => o.Account_ID);
    if (ownerIds.length === 0) return res.json({ success: true, data: [] });

    const placeholders = ownerIds.map(() => '?').join(',');
    const [vehicles] = await pool.query(
      `SELECT v.*,
              COALESCE(
                (SELECT Photo_URL FROM VEHICLE_PHOTO
                 WHERE Vehicle_ID = v.Vehicle_ID AND Is_Primary = 1 LIMIT 1),
                NULL
              ) AS Primary_Photo
       FROM VEHICLE v
       WHERE v.Owner_Account_ID IN (${placeholders})`,
      ownerIds
    );

    const data = owners.map(owner => ({
      ...owner,
      vehicles: vehicles.filter(v => v.Owner_Account_ID === owner.Account_ID)
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Get your own profile
router.get('/me', auth, async (req, res) => {
  try {
    const [[person]] = await pool.query(
      `SELECT Account_ID, Name, Address, Email, Contact_Number, Drivers_License FROM PERSON WHERE Account_ID = ?`,
      [req.user.account_id]
    );
    if (!person) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: person });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Profile Update 
router.put('/me', auth, async (req, res) => {
    const { name, address, contact_number, drivers_license, email } = req.body;
    try {
      await pool.query(
        `UPDATE PERSON SET Name=?, Address=?, Contact_Number=?, Drivers_License=?, Email=? WHERE Account_ID=?`,
        [name, address, contact_number, drivers_license || null, email || null, req.user.account_id]
      );
    res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// View other user's basic info 
router.get('/:id', auth, async (req, res) => {
  try {
    const [[person]] = await pool.query(
      `SELECT Account_ID, Name, Email, Contact_Number FROM PERSON WHERE Account_ID = ?`,
      [req.params.id]
    );
    if (!person) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: person });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
