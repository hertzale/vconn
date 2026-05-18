USE vcunt_db;

-- Add missing inquiry columns used by frontend
ALTER TABLE INQUIRY
  ADD COLUMN IF NOT EXISTS Agreed_Price DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS Created_At DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Ensure notifications reference an account
ALTER TABLE NOTIFICATION
  MODIFY COLUMN Account_ID VARCHAR(12) NOT NULL;

-- Refresh the inquiry status CHECK constraint if it exists
SET @old_inquiry_chk = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'INQUIRY'
    AND CONSTRAINT_TYPE = 'CHECK'
  LIMIT 1
);
SET @sql = IF(@old_inquiry_chk IS NOT NULL,
  CONCAT('ALTER TABLE INQUIRY DROP CHECK ', @old_inquiry_chk),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE INQUIRY
  ADD CONSTRAINT chk_inquiry_status CHECK (
    Inquiry_Status IN (
      'Pending','Owner_Quoted','Negotiating','Accepted',
      'Rejected','Confirmed','Cancelled','Booked'
    )
  );

-- Refresh the rental transaction status CHECK constraint if it exists
SET @old_rental_chk = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RENTAL_TRANSACTION'
    AND CONSTRAINT_TYPE = 'CHECK'
  LIMIT 1
);
SET @sql = IF(@old_rental_chk IS NOT NULL,
  CONCAT('ALTER TABLE RENTAL_TRANSACTION DROP CHECK ', @old_rental_chk),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE RENTAL_TRANSACTION
  ADD CONSTRAINT chk_rental_status CHECK (
    Rental_Status IN (
      'Pending','Confirmed','Reserved','Ongoing',
      'Completed','Cancelled','Overdue'
    )
  );
