const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');
const genID   = require('../config/idGen');

const router = express.Router();

// GET /api/notifications — all notifications for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const [notifications] = await pool.query(
      `SELECT * FROM NOTIFICATION
       WHERE Account_ID = ?
       ORDER BY Created_At DESC`,
      [req.user.account_id]
    );
    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE NOTIFICATION SET Is_Read = 1
       WHERE Notification_ID = ? AND Account_ID = ?`,
      [req.params.id, req.user.account_id]
    );
    res.json({ success: true, message: `Notification ${req.params.id} marked as read.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE NOTIFICATION SET Is_Read = 1 WHERE Account_ID = ?`,
      [req.user.account_id]
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/notifications — create a notification
router.post('/', auth, async (req, res) => {
  const { notification_type, message, reference_id, reference_type, is_read, account_id } = req.body;

  if (!notification_type || !reference_id) {
    return res.status(400).json({
      success: false,
      message: 'notification_type and reference_id are required.'
    });
  }

  const validTypes = ['Inquiry', 'Booking', 'Payment', 'Reminder'];
  if (!validTypes.includes(notification_type)) {
    return res.status(400).json({
      success: false,
      message: `notification_type must be one of: ${validTypes.join(', ')}.`
    });
  }

  const validRefTypes = ['Inquiry', 'Booking', 'Vehicle', 'Trip'];
  if (reference_type && !validRefTypes.includes(reference_type)) {
    return res.status(400).json({
      success: false,
      message: `reference_type must be one of: ${validRefTypes.join(', ')}.`
    });
  }

  try {
    const notifID = await genID('NOTIFICATION');
    const targetId  = account_id || req.user.account_id;

    await pool.query(
      `INSERT INTO NOTIFICATION
         (Notification_ID, Account_ID, Notification_Type, Message,
          Reference_ID, Reference_Type, Is_Read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        notifID, targetId, notification_type,
        message || null, reference_id,
        reference_type || 'Inquiry',
        is_read ? 1 : 0
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Notification created.',
      data: { notification_id: notifID }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;