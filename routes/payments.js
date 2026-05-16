const express = require('express');
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const genID  = require('../config/idGen');

const router = express.Router();

// Transaction Payment
router.get('/:txId', auth, async (req, res) => {
  try {
    const [[payment]] = await pool.query(
      `SELECT p.* FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Transaction_ID = ? AND (rt.Customer_Account_ID = ? OR rt.Owner_Account_ID = ?)`,
      [req.params.txId, req.user.account_id, req.user.account_id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    res.json({ success: true, data: payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Payment record generation
router.post('/', auth, async (req, res) => {
  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(400).json({ success: false, message: 'transaction_id is required.' });

  try {
    const [[tx]] = await pool.query(
      `SELECT rt.*, v.Daily_Rate FROM RENTAL_TRANSACTION rt
       JOIN VEHICLE v ON rt.Vehicle_ID = v.Vehicle_ID
       WHERE rt.Transaction_ID = ? AND rt.Customer_Account_ID = ?`,
      [transaction_id, req.user.account_id]
    );
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found or not yours.' });
    if (tx.Rental_Status !== 'Confirmed') return res.status(400).json({ success: false, message: 'Payment can only be created for a Confirmed transaction.' });

    const [[existing]] = await pool.query(`SELECT Payment_ID FROM PAYMENT WHERE Transaction_ID = ?`, [transaction_id]);
    if (existing) return res.status(409).json({ success: false, message: 'Payment already exists for this transaction.' });

    const days       = tx.Rental_Duration || 1;
    const serviceFee = tx.With_Driver ? tx.Daily_Rate * days * 0.10 : 0;
    const total      = (tx.Daily_Rate * days) + serviceFee;

    const paymentID = await genID('PAYMENT');
    const today     = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO PAYMENT (Payment_ID, Transaction_ID, Total_Amount, Payment_Method, Payment_Date, Payment_Status)
       VALUES (?, ?, ?, 'Cash', ?, 'Pending')`,
      [paymentID, transaction_id, total.toFixed(2), today]
    );

    res.status(201).json({
      success: true,
      message: 'Payment record created. Pay cash on pickup.',
      data: { payment_id: paymentID, total_amount: total.toFixed(2), rental_days: days, service_fee: serviceFee.toFixed(2) }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Owner payment confirmation (Paid or Refunded)
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  if (!['Paid', 'Refunded'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be Paid or Refunded.' });

  try {
    const [[payment]] = await pool.query(
      `SELECT p.*, rt.Owner_Account_ID FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Payment_ID = ?`,
      [req.params.id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.Owner_Account_ID !== req.user.account_id) return res.status(403).json({ success: false, message: 'Only the vehicle owner can update payment status.' });

    await pool.query(`UPDATE PAYMENT SET Payment_Status = ? WHERE Payment_ID = ?`, [status, req.params.id]);
    res.json({ success: true, message: `Payment marked as ${status}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Owner records a payment receipt (partial or full)
router.post('/:id/receipt', auth, async (req, res) => {
  const { amount_paid, payment_type, remarks } = req.body;

  if (!amount_paid) return res.status(400).json({ success: false, message: 'amount_paid is required.' });
  if (payment_type && !['Full', 'Partial'].includes(payment_type))
    return res.status(400).json({ success: false, message: 'payment_type must be Full or Partial.' });

  try {
    const [[payment]] = await pool.query(
      `SELECT p.*, rt.Owner_Account_ID FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Payment_ID = ?`,
      [req.params.id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Only the owner can record receipts.' });

    // Check total paid 
    const [[{ total_paid }]] = await pool.query(
      `SELECT COALESCE(SUM(Amount_Paid), 0) AS total_paid
       FROM RECEIPT WHERE Payment_ID = ?`,
      [req.params.id]
    );

    const remaining = parseFloat(payment.Total_Amount) - parseFloat(total_paid);
    if (parseFloat(amount_paid) > remaining) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds remaining balance of ₱${remaining.toFixed(2)}.`
      });
    }

    const receiptID = await genID('RECEIPT');
    const today = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO RECEIPT (Receipt_ID, Payment_ID, Amount_Paid, Payment_Type, Remarks, Receipt_Date, Recorded_By)
       VALUES (?,?,?,?,?,?,?)`,
      [receiptID, req.params.id, amount_paid, payment_type || 'Full', remarks || null, today, req.user.account_id]
    );

    const newTotal = parseFloat(total_paid) + parseFloat(amount_paid);
    if (newTotal >= parseFloat(payment.Total_Amount)) {
      await pool.query(
        `UPDATE PAYMENT SET Payment_Status = 'Paid' WHERE Payment_ID = ?`,
        [req.params.id]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Receipt recorded.',
      data: {
        receipt_id: receiptID,
        amount_paid,
        total_paid: newTotal.toFixed(2),
        remaining: (parseFloat(payment.Total_Amount) - newTotal).toFixed(2)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/payments/:id/receipts — list all receipts for a payment
router.get('/:id/receipts', auth, async (req, res) => {
  try {
    const [[payment]] = await pool.query(
      `SELECT p.*, rt.Owner_Account_ID, rt.Customer_Account_ID
       FROM PAYMENT p
       JOIN RENTAL_TRANSACTION rt ON p.Transaction_ID = rt.Transaction_ID
       WHERE p.Payment_ID = ?`,
      [req.params.id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.Owner_Account_ID !== req.user.account_id &&
        payment.Customer_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    const [receipts] = await pool.query(
      `SELECT r.*, p.Name AS Recorded_By_Name
       FROM RECEIPT r
       JOIN PERSON p ON r.Recorded_By = p.Account_ID
       WHERE r.Payment_ID = ?
       ORDER BY r.Receipt_Date ASC`,
      [req.params.id]
    );

    const [[{ total_paid }]] = await pool.query(
      `SELECT COALESCE(SUM(Amount_Paid), 0) AS total_paid FROM RECEIPT WHERE Payment_ID = ?`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        payment,
        receipts,
        total_paid: parseFloat(total_paid).toFixed(2),
        remaining: (parseFloat(payment.Total_Amount) - parseFloat(total_paid)).toFixed(2)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
