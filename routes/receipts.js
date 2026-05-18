const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const genID = require('../config/idGen');

const router = express.Router();

// GET /api/receipts — list receipts visible to the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const [receipts] = await pool.query(
      `SELECT r.*, p.Payment_Status, p.Total_Amount,
              rt.Transaction_ID, rt.Customer_Account_ID, rt.Owner_Account_ID,
              pr.Name AS Recorded_By_Name
       FROM RECEIPT r
       JOIN PAYMENT p ON r.Payment_ID = p.Payment_ID
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       LEFT JOIN PERSON pr ON r.Recorded_By = pr.Account_ID
       WHERE rt.Owner_Account_ID = ?
          OR rt.Customer_Account_ID = ?
          OR r.Recorded_By = ?
       ORDER BY r.Receipt_Date DESC`,
      [req.user.account_id, req.user.account_id, req.user.account_id]
    );

    res.json({ success: true, data: receipts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/receipts/payment/:paymentId — list receipts for a payment
router.get('/payment/:paymentId', auth, async (req, res) => {
  try {
    const [[payment]] = await pool.query(
      `SELECT p.Payment_ID, p.Transaction_ID, rt.Customer_Account_ID, rt.Owner_Account_ID
       FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Payment_ID = ?`,
      [req.params.paymentId]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.Owner_Account_ID !== req.user.account_id && payment.Customer_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    const [receipts] = await pool.query(
      `SELECT r.*, pr.Name AS Recorded_By_Name
       FROM RECEIPT r
       LEFT JOIN PERSON pr ON r.Recorded_By = pr.Account_ID
       WHERE r.Payment_ID = ?
       ORDER BY r.Receipt_Date ASC`,
      [req.params.paymentId]
    );

    res.json({ success: true, data: receipts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/receipts/transaction/:txId — list receipts for a transaction
router.get('/transaction/:txId', auth, async (req, res) => {
  try {
    const [[transaction]] = await pool.query(
      `SELECT Transaction_ID, Customer_Account_ID, Owner_Account_ID
       FROM RENTAL_TRANSACTION
       WHERE Transaction_ID = ?`,
      [req.params.txId]
    );
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (transaction.Owner_Account_ID !== req.user.account_id && transaction.Customer_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    const [receipts] = await pool.query(
      `SELECT r.*, pr.Name AS Recorded_By_Name, p.Payment_ID
       FROM RECEIPT r
       JOIN PAYMENT p ON r.Payment_ID = p.Payment_ID
       LEFT JOIN PERSON pr ON r.Recorded_By = pr.Account_ID
       WHERE p.Transaction_ID = ?
       ORDER BY r.Receipt_Date ASC`,
      [req.params.txId]
    );

    res.json({ success: true, data: receipts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/receipts/:id — get a single receipt by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const [[receipt]] = await pool.query(
      `SELECT r.*, p.Payment_Status, p.Total_Amount,
              rt.Transaction_ID, rt.Customer_Account_ID, rt.Owner_Account_ID,
              pr.Name AS Recorded_By_Name
       FROM RECEIPT r
       JOIN PAYMENT p ON r.Payment_ID = p.Payment_ID
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       LEFT JOIN PERSON pr ON r.Recorded_By = pr.Account_ID
       WHERE r.Receipt_ID = ?
         AND (rt.Owner_Account_ID = ? OR rt.Customer_Account_ID = ? OR r.Recorded_By = ?)
       LIMIT 1`,
      [req.params.id, req.user.account_id, req.user.account_id, req.user.account_id]
    );
    if (!receipt) return res.status(404).json({ success: false, message: 'Receipt not found.' });

    res.json({ success: true, data: receipt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/receipts — create a receipt for a payment
router.post('/', auth, async (req, res) => {
  const { payment_id, amount_paid, payment_type, remarks } = req.body;

  if (!payment_id) return res.status(400).json({ success: false, message: 'payment_id is required.' });
  if (!amount_paid) return res.status(400).json({ success: false, message: 'amount_paid is required.' });

  try {
    const [[payment]] = await pool.query(
      `SELECT p.*, rt.Owner_Account_ID, rt.Customer_Account_ID
       FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Payment_ID = ?`,
      [payment_id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Only the owner can record receipts.' });

    const [[{ total_paid }]] = await pool.query(
      `SELECT COALESCE(SUM(Amount_Paid), 0) AS total_paid
       FROM RECEIPT WHERE Payment_ID = ?`,
      [payment_id]
    );

    const remaining = parseFloat(payment.Total_Amount) - parseFloat(total_paid);
    if (parseFloat(amount_paid) > remaining) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds remaining balance of ₱${remaining.toFixed(2)}.`
      });
    }

    const normalizedType = payment_type
      ? payment_type
      : parseFloat(amount_paid) < remaining ? 'Partial' : 'Full';
    if (!['Full', 'Partial'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'payment_type must be Full or Partial.' });
    }

    const receiptID = await genID('RECEIPT');
    const today = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO RECEIPT (Receipt_ID, Payment_ID, Amount_Paid, Payment_Type, Remarks, Receipt_Date, Recorded_By)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [receiptID, payment_id, amount_paid, normalizedType, remarks || null, today, req.user.account_id]
    );

    const newTotalPaid = parseFloat(total_paid) + parseFloat(amount_paid);
    if (newTotalPaid >= parseFloat(payment.Total_Amount)) {
      await pool.query(`UPDATE PAYMENT SET Payment_Status = 'Paid' WHERE Payment_ID = ?`, [payment_id]);
    }

    res.status(201).json({
      success: true,
      message: 'Receipt created.',
      data: {
        receipt_id: receiptID,
        payment_id,
        amount_paid,
        payment_type: normalizedType,
        total_paid: newTotalPaid.toFixed(2),
        remaining: (parseFloat(payment.Total_Amount) - newTotalPaid).toFixed(2)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
