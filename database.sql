CREATE DATABASE vcunt_db;
USE vcunt_db;

CREATE TABLE BUSINESS (
    Business_ID VARCHAR(12) PRIMARY KEY,
    Business_Name VARCHAR(50) NOT NULL,
    Business_Address VARCHAR(100) NOT NULL,
    Business_Email VARCHAR(35),
    Business_ContactNo VARCHAR(15),
    Description VARCHAR(300),
    Service_Area VARCHAR(100),
    
    Operating_Hours VARCHAR(100) DEFAULT NULL,
    Latitude DECIMAL(10,7),
	Longitude DECIMAL(10,7),
    Is_Active TINYINT(1) DEFAULT 1,
    Created_Date DATE NOT NULL,
   
	Vehicle_ID VARCHAR(12),
	Owner_Account_ID VARCHAR(12),
    
	FOREIGN KEY (Owner_Account_ID)
	REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Vehicle_ID)
	REFERENCES Vehicle(Vehicle_ID)
);

CREATE TABLE PAYMENT (
    Payment_ID VARCHAR(12) PRIMARY KEY,
    Transaction_ID VARCHAR(12) NOT NULL,
    Total_Amount DECIMAL(10,2) NOT NULL,
    Payment_Method VARCHAR(20),
    Payment_Date DATE NOT NULL,
    Payment_Status VARCHAR(20),
    
	CHECK (
		Payment_Status IN ('Paid', 'Pending', 'Refunded')),

	CHECK (
		Payment_Method IN ('Cash')),
	
    FOREIGN KEY (Transaction_ID)
	REFERENCES RENTAL_TRANSACTION(Transaction_ID)
);

CREATE TABLE PERSON (
    Account_ID VARCHAR(12) NOT NULL PRIMARY KEY,
    Person_Name VARCHAR(30) NOT NULL,
    Address VARCHAR(35) NOT NULL,
    Email VARCHAR(35),
    Contact_Number VARCHAR(15),
    Drivers_License VARCHAR(10),
    Password VARCHAR(35) NOT NULL,
    Role VARCHAR(30) NOT NULL
);

CREATE TABLE RENTAL_TRANSACTION (
    Transaction_ID VARCHAR(12) NOT NULL PRIMARY KEY,
    Transaction_Date DATE NOT NULL,
    Start_Date DATE NOT NULL,
	End_Date DATE NOT NULL,
	Start_Time TIME NOT NULL,
	End_Time TIME NOT NULL,
    Pickup_Location VARCHAR(100),
    Drop_off_Location VARCHAR(100),
    Rental_Duration INT,
    Location VARCHAR(100),
    With_Driver TINYINT(1),
    Gas_Included TINYINT(1),
    Other_Details VARCHAR(150),
	Total_Amount  DECIMAL(10,2) NOT NULL,
	Rental_Status VARCHAR(20),
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    Customer_Account_ID VARCHAR(12) NOT NULL,
    Owner_Account_ID VARCHAR(12) NOT NULL,
    Vehicle_ID VARCHAR(12),
    Driver_Name VARCHAR(30),
	Drivers_License VARCHAR(10),

   CHECK (
		Rental_Status IN ('Pending', 'Reserved', 'Ongoing', 'Completed', 'Cancelled', 'Overdue')),
        
	FOREIGN KEY (Vehicle_ID)
    REFERENCES VEHICLE(Vehicle_ID),
    FOREIGN KEY (Customer_Account_ID)
    REFERENCES PERSON(Account_ID),
    FOREIGN KEY (Owner_Account_ID)
    REFERENCES PERSON(Account_ID)
);
 
CREATE TABLE VEHICLE (
    Vehicle_ID VARCHAR(12) PRIMARY KEY,
    Vehicle_Model VARCHAR(30),
	Vehicle_Type VARCHAR(20),
    Vehicle_Color VARCHAR(20),
    Seat_Capacity INT,
    Plate_Number VARCHAR(10),
    Registration_Date DATE NOT NULL,
	Vehicle_Status VARCHAR(25),
	Fuel_Type VARCHAR(20),
	Daily_Rate  DECIMAL(10,2),
     
	Owner_Account_ID VARCHAR(12) NOT NULL,
    
    CHECK (
		Vehicle_Status IN ('Available', 'Rented', 'Under Maintenance')),

    FOREIGN KEY (Owner_Account_ID)
    REFERENCES PERSON(Account_ID)    
); 

CREATE TABLE FEEDBACK (
    Feedback_ID VARCHAR(12) PRIMARY KEY,
    Date_Submitted DATE NOT NULL,
    Score INT NOT NULL,
    Comments VARCHAR(150),
    
    Vehicle_ID VARCHAR(12),
	Transaction_ID VARCHAR(12),
    Customer_Account_ID VARCHAR(12) NOT NULL,
    
	FOREIGN KEY (Vehicle_ID)
    REFERENCES VEHICLE(Vehicle_ID),
    FOREIGN KEY (Transaction_ID)
    REFERENCES RENTAL_TRANSACTION(Transaction_ID),
    FOREIGN KEY (Customer_Account_ID)
    REFERENCES PERSON(Account_ID)    
);

CREATE TABLE INQUIRY (
    Inquiry_ID VARCHAR(12) PRIMARY KEY,
    Sender_Type VARCHAR(20) NOT NULL,
    Offered_Price DECIMAL(10,2) NOT NULL,
    Agreed_Price DECIMAL(10,2) NULL,
    Start_Date DATE NOT NULL,
    End_Date DATE NOT NULL,
    Message VARCHAR(150),
    Inquiry_Status VARCHAR(20) DEFAULT 'Pending',
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    Customer_Account_ID VARCHAR(12) NOT NULL,
    Owner_Account_ID VARCHAR(12) NOT NULL, 
    Vehicle_ID VARCHAR(12),

    CHECK (
        Inquiry_Status IN ('Pending', 'Accepted', 'Rejected', 'Completed')),
        
	FOREIGN KEY (Customer_Account_ID)
	REFERENCES PERSON(Account_ID),
	FOREIGN KEY (Owner_Account_ID)
	REFERENCES PERSON(Account_ID),
	FOREIGN KEY (Vehicle_ID)
	REFERENCES VEHICLE(Vehicle_ID)
);

CREATE TABLE NOTIFICATION (
    Notification_ID VARCHAR(12) PRIMARY KEY,
    Notification_Type VARCHAR(30) NOT NULL,
    Message VARCHAR(150),
    Reference_ID VARCHAR(12) NOT NULL,
    Reference_Type VARCHAR(30),
    Is_Read BOOLEAN DEFAULT FALSE,
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    Account_ID VARCHAR(12),

    CHECK (
        Reference_Type IN ('Inquiry', 'Booking', 'Vehicle')),

    CHECK (
        Notification_Type IN ('Inquiry', 'Booking', 'Payment', 'Reminder')),
        
	FOREIGN KEY(Account_ID)
	REFERENCES PERSON(Account_ID)
);

CREATE TABLE RECEIPT (
   Receipt_ID VARCHAR(12) NOT NULL PRIMARY KEY,
   Amount_Paid DECIMAL(10,2) NOT NULL,
   Payment_Type VARCHAR(10) DEFAULT 'Full',
   Remarks VARCHAR(200) DEFAULT NULL,
   Receipt_Date DATE NOT NULL,
   Recorded_By VARCHAR(12) NOT NULL,
   
   Payment_ID VARCHAR(12) NOT NULL,
   
   FOREIGN KEY (Payment_ID)  
   REFERENCES PAYMENT(Payment_ID),
   FOREIGN KEY (Recorded_By) 
   REFERENCES PERSON(Account_ID)
);

CREATE TABLE VEHICLE_PHOTO (
   Photo_ID VARCHAR(12) NOT NULL PRIMARY KEY,
   Photo_URL VARCHAR(255) NOT NULL,
   Is_Primary TINYINT(1) DEFAULT 0,
   
   Vehicle_ID VARCHAR(12) NOT NULL,
   FOREIGN KEY (Vehicle_ID) 
   REFERENCES VEHICLE(Vehicle_ID)
);

CREATE TABLE ID_COUNTER (
    Entity VARCHAR(30) PRIMARY KEY,
    Last_Num INT NOT NULL
);

INSERT INTO ID_COUNTER (entity, last_num) VALUES
   ('BUSINESS', 0),
   ('PHOTO', 0),
   ('RECEIPT', 0)
ON DUPLICATE KEY UPDATE entity = entity;

##FOR STORING DELETED ID's
CREATE TABLE AVAILABLE_ACCOUNT_IDS (
    Account_ID VARCHAR(12) PRIMARY KEY
);

##FOR SAVING DELETED ID's where if a user gets deleted, their Account_ID would still be saved

DELIMITER //
CREATE TRIGGER trg_store_deleted_account
AFTER DELETE ON PERSON
FOR EACH ROW

BEGIN
    INSERT INTO AVAILABLE_ACCOUNT_IDS(Account_ID)
    VALUES (OLD.Account_ID);
    
END //
DELIMITER ;

##For checking if there is an old Account_ID and reuses it when a new user registers
##if there is none then, it created a new ID.
DELIMITER //

CREATE PROCEDURE AddPerson(
    IN p_name VARCHAR(30),
    IN p_address VARCHAR(35),
    IN p_email VARCHAR(35),
    IN p_contact VARCHAR(15),
    IN p_license VARCHAR(10),
    IN p_password VARCHAR(35),
    IN p_role VARCHAR(30)
)

BEGIN
    DECLARE v_account_id VARCHAR(12);  #To check if there are any Reusable Account_ID

    SELECT Account_ID
    INTO v_account_id
    FROM AVAILABLE_ACCOUNT_IDS
    LIMIT 1;

    IF v_account_id IS NOT NULL  #Re-uses the Old Account_ID
    THEN
		INSERT INTO PERSON (
            Account_ID,
            Person_Name,
            Address, Email,
            Contact_Number,
            Drivers_License,
            Password,
            Role
		)

        VALUES (
            v_account_id,
            p_name,
            p_address,
            p_email,
            p_contact,
            p_license,
            p_password,
            p_role
		);

        DELETE FROM AVAILABLE_ACCOUNT_IDS
        WHERE Account_ID = v_account_id;
        
    ELSE #Create a New ID for the new user
		SELECT CONCAT(
    'ACC',
    LPAD(
        IFNULL(
            MAX(CAST(SUBSTRING(Account_ID,4) AS UNSIGNED)),
            0
        ) + 1,
        3,
        '0'
    )
)
	INTO v_account_id
	FROM PERSON;
 
##for inserting a new Person

        INSERT INTO PERSON (
            Account_ID,
            Person_Name,
            Address,
            Email,
            Contact_Number,
            Drivers_License,
            Password,
            Role
		)

        VALUES (
            v_account_id,
            p_name,
            p_address,
            p_email,
            p_contact,
            p_license,
            p_password,
            p_role
		);
END IF;
END //

DELIMITER ;
