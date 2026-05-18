-- ============================================================
-- V-Connect Unified Database
-- ============================================================
CREATE DATABASE IF NOT EXISTS vcunt_db;
USE vcunt_db;

-- ── PERSON ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS PERSON (
    Account_ID      VARCHAR(12)  NOT NULL,
    Name            VARCHAR(30)  NOT NULL,
    Address         VARCHAR(35)  NOT NULL,
    Email           VARCHAR(35)  UNIQUE,
    Contact_Number  VARCHAR(11)  UNIQUE,
    Drivers_License VARCHAR(10)  DEFAULT NULL,
    Password        VARCHAR(255) NOT NULL,
    Owner_Type      VARCHAR(30)  DEFAULT NULL,
    PRIMARY KEY (Account_ID)
);

-- ── BUSINESS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS BUSINESS (
    Business_ID      VARCHAR(12)    NOT NULL PRIMARY KEY,
    Owner_Account_ID VARCHAR(12)    NOT NULL,
    Business_Name    VARCHAR(50)    NOT NULL,
    Business_Address VARCHAR(100)   NOT NULL,
    Description      VARCHAR(300)   DEFAULT NULL,
    Contact_Number   VARCHAR(15)    DEFAULT NULL,
    Email            VARCHAR(35)    DEFAULT NULL,
    Operating_Hours  VARCHAR(100)   DEFAULT NULL,
    Service_Area     VARCHAR(100)   DEFAULT NULL,
    Latitude         DECIMAL(10,7)  DEFAULT NULL,
    Longitude        DECIMAL(10,7)  DEFAULT NULL,
    Owner_Type       VARCHAR(30)    DEFAULT 'owner',
    Is_Active        TINYINT(1)     DEFAULT 1,
    Created_Date     DATE           NOT NULL,
    FOREIGN KEY (Owner_Account_ID) REFERENCES PERSON(Account_ID)
);

-- ── VEHICLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS VEHICLE (
    Vehicle_ID        VARCHAR(12)   NOT NULL,
    Vehicle_Type      VARCHAR(10),
    Vehicle_Model     VARCHAR(30),
    Vehicle_Color     VARCHAR(12),
    Seat_Capacity     INT,
    Daily_Rate        DECIMAL(10,2),
    Plate_Number      VARCHAR(10)   UNIQUE,
    Registration_Date DATE          NOT NULL,
    Vehicle_Status    VARCHAR(20)   DEFAULT 'Available',
    Fuel_Type         VARCHAR(10),
    With_Driver       TINYINT(1)    DEFAULT 0,
    Business_ID       VARCHAR(12)   DEFAULT NULL,
    Owner_Account_ID  VARCHAR(12)   NOT NULL,
    PRIMARY KEY (Vehicle_ID),
    FOREIGN KEY (Owner_Account_ID) REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Business_ID)      REFERENCES BUSINESS(Business_ID),
    CHECK (Vehicle_Status IN ('Available', 'Rented', 'Under Maintenance'))
);

-- ── RENTAL_TRANSACTION ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS RENTAL_TRANSACTION (
    Transaction_ID      VARCHAR(12)  NOT NULL,
    Vehicle_ID          VARCHAR(12),
    Transaction_Date    DATE         NOT NULL,
    Start_Date_and_Time DATETIME     NOT NULL,
    End_Date_and_Time   DATETIME     NOT NULL,
    Pickup_Location     VARCHAR(100),
    Drop_off_Location   VARCHAR(100),
    Rental_Duration     INT,
    With_Driver         TINYINT(1)   DEFAULT 0,
    Rental_Status       VARCHAR(20)  DEFAULT 'Pending',
    Customer_Account_ID VARCHAR(12)  NOT NULL,
    Owner_Account_ID    VARCHAR(12)  NOT NULL,
    PRIMARY KEY (Transaction_ID),
    FOREIGN KEY (Vehicle_ID)          REFERENCES VEHICLE(Vehicle_ID),
    FOREIGN KEY (Customer_Account_ID) REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Owner_Account_ID)    REFERENCES PERSON(Account_ID),
    CHECK (Rental_Status IN ('Pending', 'Reserved', 'Ongoing', 'Completed', 'Cancelled'))
);

-- ── PAYMENT ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS PAYMENT (
    Payment_ID     VARCHAR(12)   NOT NULL,
    Transaction_ID VARCHAR(12)   NOT NULL,
    Total_Amount   DECIMAL(10,2) NOT NULL,
    Payment_Method VARCHAR(20)   DEFAULT 'Cash',
    Payment_Date   DATE          NOT NULL,
    Payment_Status VARCHAR(20)   DEFAULT 'Pending',
    PRIMARY KEY (Payment_ID),
    FOREIGN KEY (Transaction_ID) REFERENCES RENTAL_TRANSACTION(Transaction_ID),
    CHECK (Payment_Status IN ('Paid', 'Pending', 'Refunded')),
    CHECK (Payment_Method IN ('Cash'))
);

-- ── RECEIPT ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS RECEIPT (
    Receipt_ID   VARCHAR(12)   NOT NULL PRIMARY KEY,
    Payment_ID   VARCHAR(12)   NOT NULL,
    Amount_Paid  DECIMAL(10,2) NOT NULL,
    Payment_Type VARCHAR(10)   DEFAULT 'Full',
    Remarks      VARCHAR(200)  DEFAULT NULL,
    Receipt_Date DATE          NOT NULL,
    Recorded_By  VARCHAR(12)   NOT NULL,
    FOREIGN KEY (Payment_ID)  REFERENCES PAYMENT(Payment_ID),
    FOREIGN KEY (Recorded_By) REFERENCES PERSON(Account_ID),
    CHECK (Payment_Type IN ('Full', 'Partial'))
);

-- ── FEEDBACK ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS FEEDBACK (
    Feedback_ID         VARCHAR(12)  NOT NULL,
    Vehicle_ID          VARCHAR(12),
    Transaction_ID      VARCHAR(12)  UNIQUE,
    Date_Submitted      DATE         NOT NULL,
    Score               INT          NOT NULL,
    Customer_Account_ID VARCHAR(12)  NOT NULL,
    Comments            VARCHAR(150),
    PRIMARY KEY (Feedback_ID),
    FOREIGN KEY (Vehicle_ID)          REFERENCES VEHICLE(Vehicle_ID),
    FOREIGN KEY (Transaction_ID)      REFERENCES RENTAL_TRANSACTION(Transaction_ID),
    FOREIGN KEY (Customer_Account_ID) REFERENCES PERSON(Account_ID),
    CHECK (Score BETWEEN 1 AND 5)
);

-- ── TRIP ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS TRIP (
    Trip_ID             VARCHAR(12) NOT NULL PRIMARY KEY,
    Customer_Account_ID VARCHAR(12) NOT NULL,
    Trip_Name           VARCHAR(50) NOT NULL,
    Planned_Start       DATE        DEFAULT NULL,
    Planned_End         DATE        DEFAULT NULL,
    Pickup_Location     VARCHAR(100),
    Drop_off_Location   VARCHAR(100),
    Created_Date        DATE        NOT NULL,
    FOREIGN KEY (Customer_Account_ID) REFERENCES PERSON(Account_ID)
);

-- ── INQUIRY ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS INQUIRY (
    Inquiry_ID               VARCHAR(12)   NOT NULL PRIMARY KEY,
    Trip_ID                  VARCHAR(12)   DEFAULT NULL,
    Vehicle_ID               VARCHAR(12),
    Customer_Account_ID      VARCHAR(12)   NOT NULL,
    Owner_Account_ID         VARCHAR(12)   NOT NULL,
    Rental_Duration          INT,
    Distance_KM              DECIMAL(8,2)  DEFAULT NULL,
    Pickup_Location          VARCHAR(100),
    Drop_off_Location        VARCHAR(100),
    Start_Date               DATE          DEFAULT NULL,
    End_Date                 DATE          DEFAULT NULL,
    With_Driver              TINYINT(1)    DEFAULT 0,
    Customer_Message         VARCHAR(150)  DEFAULT NULL,
    Offered_Price            DECIMAL(10,2) DEFAULT NULL,
    Sender_Type              VARCHAR(20)   DEFAULT 'Customer',
    Inquiry_Status           VARCHAR(30)   DEFAULT 'Pending',
    Inquiry_Date             DATE          NOT NULL,
    Owner_Response_Type      VARCHAR(10)   DEFAULT NULL,
    Owner_Price_Min          DECIMAL(10,2) DEFAULT NULL,
    Owner_Price_Max          DECIMAL(10,2) DEFAULT NULL,
    Owner_Set_Price          DECIMAL(10,2) DEFAULT NULL,
    Owner_Message            VARCHAR(150)  DEFAULT NULL,
    Customer_Decision        VARCHAR(20)   DEFAULT NULL,
    Customer_Counter_Price   DECIMAL(10,2) DEFAULT NULL,
    Customer_Counter_Message VARCHAR(150)  DEFAULT NULL,
    Final_Agreed_Price       DECIMAL(10,2) DEFAULT NULL,
    Transaction_ID           VARCHAR(12)   DEFAULT NULL,
    Updated_At               DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (Trip_ID)             REFERENCES TRIP(Trip_ID),
    FOREIGN KEY (Vehicle_ID)          REFERENCES VEHICLE(Vehicle_ID),
    FOREIGN KEY (Customer_Account_ID) REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Owner_Account_ID)    REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Transaction_ID)      REFERENCES RENTAL_TRANSACTION(Transaction_ID),
    CHECK (Inquiry_Status IN ('Pending','Owner_Quoted','Negotiating','Confirmed','Cancelled','Booked'))
);

-- ── NOTIFICATION ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS NOTIFICATION (
    Notification_ID   VARCHAR(12)  NOT NULL PRIMARY KEY,
    Account_ID        VARCHAR(12),
    Notification_Type VARCHAR(30)  NOT NULL,
    Message           VARCHAR(150),
    Reference_ID      VARCHAR(12)  NOT NULL,
    Reference_Type    VARCHAR(30),
    Is_Read           BOOLEAN      DEFAULT FALSE,
    Created_At        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Account_ID) REFERENCES PERSON(Account_ID),
    CHECK (Reference_Type    IN ('Inquiry', 'Booking', 'Vehicle', 'Trip')),
    CHECK (Notification_Type IN ('Inquiry', 'Booking', 'Payment', 'Reminder'))
);

-- ── VEHICLE_PHOTO ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS VEHICLE_PHOTO (
    Photo_ID   VARCHAR(12)  NOT NULL PRIMARY KEY,
    Vehicle_ID VARCHAR(12)  NOT NULL,
    Photo_URL  VARCHAR(255) NOT NULL,
    Is_Primary TINYINT(1)   DEFAULT 0,
    FOREIGN KEY (Vehicle_ID) REFERENCES VEHICLE(Vehicle_ID)
);

-- ── ID_COUNTER ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ID_COUNTER (
    entity   VARCHAR(20) PRIMARY KEY,
    last_num INT DEFAULT 0
);

INSERT INTO ID_COUNTER (entity, last_num) VALUES
    ('PERSON', 0), ('VEHICLE', 0), ('TRANSACTION', 0),
    ('PAYMENT', 0), ('FEEDBACK', 0), ('TRIP', 0),
    ('INQUIRY', 0), ('BUSINESS', 0), ('PHOTO', 0), ('RECEIPT', 0)
ON DUPLICATE KEY UPDATE entity = entity;