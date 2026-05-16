const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');
const genID   = require('../config/idGen');

const router = express.Router();

// GET /api/inquiries — list inquiries for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*,
              v.Vehicle_Model, v.Vehicle_Type, v.Daily_Rate,
              c.Name  AS Customer_Name,
              o.Name  AS Business_Name
       FROM INQUIRY i
       JOIN VEHICLE v ON i.Vehicle_ID = v.Vehicle_ID
       JOIN PERSON  c ON i.Customer_Account_ID = c.Account_ID
       JOIN PERSON  o ON i.Owner_Account_ID    = o.Account_ID
       WHERE i.Customer_Account_ID = ? OR i.Owner_Account_ID = ?
       ORDER BY i.Created_At DESC`,
      [req.user.account_id, req.user.account_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/inquiries/:id — single inquiry
router.get('/:id', auth, async (req, res) => {
  try {
    const [[inq]] = await pool.query(
      `SELECT i.*,
              v.Vehicle_Model, v.Vehicle_Type, v.Daily_Rate,
              c.Name AS Customer_Name,
              o.Name AS Owner_Name
       FROM INQUIRY i
       JOIN VEHICLE v ON i.Vehicle_ID = v.Vehicle_ID
       JOIN PERSON  c ON i.Customer_Account_ID = c.Account_ID
       JOIN PERSON  o ON i.Owner_Account_ID    = o.Account_ID
       WHERE i.Inquiry_ID = ?`,
      [req.params.id]
    );
    if (!inq) return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    if (inq.Customer_Account_ID !== req.user.account_id &&
        inq.Owner_Account_ID    !== req.user.account_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    res.json({ success: true, data: inq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/inquiries — customer sends offer
router.post('/', auth, async (req, res) => {
  const {
    vehicle_id, owner_account_id,
    offered_price, start_date, end_date, message,
  } = req.body;

  if (!vehicle_id || !owner_account_id || !offered_price || !start_date || !end_date) {
    return res.status(400).json({
      success: false,
      message: 'vehicle_id, owner_account_id, offered_price, start_date, end_date are required.',
    });
  }

  try {
    const [[vehicle]] = await pool.query(
      `SELECT Owner_Account_ID FROM VEHICLE WHERE Vehicle_ID = ?`,
      [vehicle_id]
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });

    const inquiryID = await genID('INQUIRY');

    await pool.query(
      `INSERT INTO INQUIRY
         (Inquiry_ID, Vehicle_ID, Customer_Account_ID, Owner_Account_ID,
          Offered_Price, Start_Date, End_Date, Message, Inquiry_Status, Created_At)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())`,
      [
        inquiryID, vehicle_id,
        req.user.account_id, owner_account_id,
        offered_price, start_date, end_date,
        message || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Offer sent.',
      data: { Inquiry_ID: inquiryID },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/inquiries/:id/respond — accept / reject / complete
router.patch('/:id/respond', auth, async (req, res) => {
  const { status, agreed_price } = req.body;
  const allowed = ['Accepted', 'Rejected', 'Completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be Accepted, Rejected, or Completed.' });
  }

  try {
    const [[inq]] = await pool.query(
      `SELECT * FROM INQUIRY WHERE Inquiry_ID = ?`,
      [req.params.id]
    );
    if (!inq) return res.status(404).json({ success: false, message: 'Inquiry not found.' });

    if (inq.Customer_Account_ID !== req.user.account_id &&
        inq.Owner_Account_ID    !== req.user.account_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const updates = ['Inquiry_Status = ?'];
    const params  = [status];

    if (status === 'Accepted' && agreed_price != null) {
      updates.push('Agreed_Price = ?');
      params.push(agreed_price);
    }

    params.push(req.params.id);
    await pool.query(
      `UPDATE INQUIRY SET ${updates.join(', ')} WHERE Inquiry_ID = ?`,
      params
    );

    res.json({ success: true, message: `Inquiry ${status}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;