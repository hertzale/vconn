const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const genID = require('../config/idGen');

const router = express.Router();

// POST /api/vehicle-photos
router.post('/', auth, async (req, res) => {
  const { vehicle_id, photo_url, is_primary } = req.body;
  if (!vehicle_id || !photo_url) return res.status(400).json({ success: false, message: 'vehicle_id and photo_url are required.' });

  try {
    const [[vehicle]] = await pool.query(`SELECT Owner_Account_ID FROM VEHICLE WHERE Vehicle_ID = ?`, [vehicle_id]);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
    if (vehicle.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Only the vehicle owner can add photos.' });

    if (is_primary) {
      await pool.query(`UPDATE VEHICLE_PHOTO SET Is_Primary = 0 WHERE Vehicle_ID = ?`, [vehicle_id]);
    }

    const photoID = await genID('PHOTO');
    await pool.query(
      `INSERT INTO VEHICLE_PHOTO (Photo_ID, Vehicle_ID, Photo_URL, Is_Primary)
       VALUES (?, ?, ?, ?)`,
      [photoID, vehicle_id, photo_url, is_primary ? 1 : 0]
    );

    res.status(201).json({ success: true, data: { photo_id: photoID, vehicle_id, photo_url, is_primary: !!is_primary } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/vehicle-photos/:id/primary
router.patch('/:id/primary', auth, async (req, res) => {
  try {
    const [[photo]] = await pool.query(
      `SELECT vp.Photo_ID, vp.Vehicle_ID, v.Owner_Account_ID
       FROM VEHICLE_PHOTO vp
       JOIN VEHICLE v ON vp.Vehicle_ID = v.Vehicle_ID
       WHERE vp.Photo_ID = ?`,
      [req.params.id]
    );
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found.' });
    if (photo.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Only the vehicle owner can set the primary photo.' });

    await pool.query(`UPDATE VEHICLE_PHOTO SET Is_Primary = 0 WHERE Vehicle_ID = ?`, [photo.Vehicle_ID]);
    await pool.query(`UPDATE VEHICLE_PHOTO SET Is_Primary = 1 WHERE Photo_ID = ?`, [req.params.id]);

    res.json({ success: true, message: 'Photo set as primary.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/vehicle-photos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [[photo]] = await pool.query(
      `SELECT vp.Photo_ID, vp.Vehicle_ID, v.Owner_Account_ID
       FROM VEHICLE_PHOTO vp
       JOIN VEHICLE v ON vp.Vehicle_ID = v.Vehicle_ID
       WHERE vp.Photo_ID = ?`,
      [req.params.id]
    );
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found.' });
    if (photo.Owner_Account_ID !== req.user.account_id)
      return res.status(403).json({ success: false, message: 'Only the vehicle owner can delete a photo.' });

    await pool.query(`DELETE FROM VEHICLE_PHOTO WHERE Photo_ID = ?`, [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;


