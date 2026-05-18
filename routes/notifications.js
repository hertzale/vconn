const express = require('express');
const router = express.Router();

// GET /api/notifications
router.get('/', (req, res) => {
  res.json({ notifications: [] });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  const { id } = req.params;
  res.json({ message: `Notification ${id} marked as read` });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', (req, res) => {
  res.json({ message: 'All notifications marked as read' });
});

// POST /api/notifications
router.post('/', (req, res) => {
  const { title, body } = req.body;
  res.status(201).json({
    notification: {
      id: Date.now().toString(),
      title: title || 'New notification',
      body: body || '',
      read: false,
      createdAt: new Date().toISOString(),
    },
  });
});

module.exports = router;

