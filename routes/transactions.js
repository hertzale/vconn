const express = require('express');
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const genID  = require('../config/idGen');

const router = express.Router();

// ADD DATE-RANGE FILTER
// See all transactions history 
router.get('/', auth, async (req, res) => {
  try {
    const { role, from, to, status } = req.query;

    let conditions = [`(rt.Customer_Account_ID = ? OR rt.Owner_Account_ID = ?)`];
    let params = [req.user.account_id, req.user.account_id];

    if (role === 'customer') {
      conditions = [`rt.Customer_Account_ID = ?`];
      params = [req.user.account_id];
    } else if (role === 'owner') {
      conditions = [`rt.Owner_Account_ID = ?`];
      params = [req.user.account_id];
    }

    if (from) { conditions.push(`rt.Transaction_Date >= ?`); params.push(from); }
    if (to)   { conditions.push(`rt.Transaction_Date <= ?`); params.push(to); }
    if (status) { conditions.push(`rt.Rental_Status = ?`); params.push(status); }

    const [rows] = await pool.query(
      `SELECT rt.*,
              v.Vehicle_Type, v.Vehicle_Model, v.Plate_Number, v.Daily_Rate,
              c.Name AS Customer_Name,
              o.Name AS Owner_Name,
              DATEDIFF(rt.End_Date_and_Time, rt.Start_Date_and_Time) AS Rental_Duration,
              DATE(rt.Start_Date_and_Time) AS Start_Date,
              DATE(rt.End_Date_and_Time)   AS End_Date,
              pay.Total_Amount, pay.Payment_Status, pay.Payment_Method
      FROM RENTAL_TRANSACTION rt
      JOIN VEHICLE v ON rt.Vehicle_ID = v.Vehicle_ID
      JOIN PERSON c  ON rt.Customer_Account_ID = c.Account_ID
      JOIN PERSON o  ON rt.Owner_Account_ID    = o.Account_ID
      LEFT JOIN PAYMENT pay ON pay.Transaction_ID = rt.Transaction_ID
      WHERE ${conditions.join(' AND ')}
      ORDER BY rt.Transaction_Date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// See one transaction
router.get('/:id', auth, async (req, res) => {
  try {
    const [[tx]] = await pool.query(
      `SELECT rt.*,
              v.Vehicle_Type, v.Vehicle_Model, v.Plate_Number, v.Daily_Rate,
              c.Name AS Customer_Name, c.Contact_Number AS Customer_Contact,
              o.Name AS Owner_Name,    o.Contact_Number AS Owner_Contact,
              DATEDIFF(rt.End_Date_and_Time, rt.Start_Date_and_Time) AS Rental_Duration
       FROM RENTAL_TRANSACTION rt
       JOIN VEHICLE v ON rt.Vehicle_ID = v.Vehicle_ID
       JOIN PERSON c  ON rt.Customer_Account_ID = c.Account_ID
       JOIN PERSON o  ON rt.Owner_Account_ID    = o.Account_ID
       WHERE rt.Transaction_ID = ?`,
      [req.params.id]
    );
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (tx.Customer_Account_ID !== req.user.account_id && tx.Owner_Account_ID !== req.user.account_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    res.json({ success: true, data: tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Booking
router.post('/', auth, async (req, res) => {
  const {
  vehicle_id,
  start_date_and_time,
  end_date_and_time,
  start_date,
  end_date,
  pickup_location,
  drop_off_location,
  with_driver,
  other_details,
  driver_name,
  drivers_license,
} = req.body;

// Accept either naming convention from frontend
const startDT = start_date_and_time || start_date;
const endDT   = end_date_and_time   || end_date;

if (!vehicle_id || !startDT || !endDT || !pickup_location) {
  return res.status(400).json({ success: false, message: 'Please fill in all booking fields.' });
}

  try {
    const [[vehicle]] = await pool.query(`SELECT * FROM VEHICLE WHERE Vehicle_ID = ?`, [vehicle_id]);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    if (vehicle.Vehicle_Status !== 'Available') return res.status(409).json({ success: false, message: 'Vehicle is not available.' });
    if (vehicle.Owner_Account_ID === req.user.account_id) return res.status(400).json({ success: false, message: 'You cannot rent your own vehicle.' });

    const needsLicense = !with_driver || Number(with_driver) === 0;
    if (needsLicense) {
      const [[me]] = await pool.query(`SELECT Drivers_License FROM PERSON WHERE Account_ID = ?`, [req.user.account_id]);
      if (!me?.Drivers_License) {
        return res.status(403).json({ success: false, message: 'You need a driver\'s license to rent without a driver.' });
      }
    }

    const rentalDuration = Math.max(1, Math.ceil(
      (new Date(endDT) - new Date(startDT)) / 86400000
    ));

    const txID  = await genID('TRANSACTION');
    const today = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO RENTAL_TRANSACTION
        (Transaction_ID, Vehicle_ID, Transaction_Date, Start_Date_and_Time, End_Date_and_Time,
         Pickup_Location, Drop_off_Location, Rental_Duration, With_Driver, Rental_Status,
         Customer_Account_ID, Owner_Account_ID)
       VALUES (?,?,?,?,?,?,?,?,?,'Pending',?,?)`,
      [txID, vehicle_id, today, startDT, endDT,
      pickup_location, drop_off_location || pickup_location, rentalDuration, with_driver ? 1 : 0,
      req.user.account_id, vehicle.Owner_Account_ID]
    );

    res.status(201).json({
      success: true,
      message: 'Booking submitted! Waiting for owner to confirm.',
      data: { transaction_id: txID }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Owner confirms/cancels transaction
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  const allowed = ['Confirmed', 'Cancelled', 'Ongoing', 'Completed'];
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });

  try {
    const [[tx]] = await pool.query(`SELECT * FROM RENTAL_TRANSACTION WHERE Transaction_ID = ?`, [req.params.id]);
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    const isOwner = tx.Owner_Account_ID === req.user.account_id;
    if ((status === 'Confirmed' || status === 'Cancelled') && !isOwner) {
      return res.status(403).json({ success: false, message: 'Only the vehicle owner can confirm or cancel.' });
    }

    await pool.query(`UPDATE RENTAL_TRANSACTION SET Rental_Status = ? WHERE Transaction_ID = ?`, [status, req.params.id]);

    if (status === 'Confirmed') {
      await pool.query(`UPDATE VEHICLE SET Vehicle_Status = 'Rented' WHERE Vehicle_ID = ?`, [tx.Vehicle_ID]);
    }
    if (status === 'Completed' || status === 'Cancelled') {
      await pool.query(`UPDATE VEHICLE SET Vehicle_Status = 'Available' WHERE Vehicle_ID = ?`, [tx.Vehicle_ID]);
    }

    res.json({ success: true, message: `Transaction updated to ${status}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
