const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const path = require('path');

const app = express();


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'project'
});


db.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('MySQL connected');
});


app.use(express.static(path.join(__dirname, 'pages')));
app.use('/pages', express.static(path.join(__dirname, 'views', 'pages')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(bodyParser.urlencoded({ extended: false }));


let loggedInUserID;
let currentRegistrationID = null; 
let currentFineID = null;

app.post('/login', (req, res) => {
  const { email, login_password } = req.body;
  const sql = 'SELECT * FROM User WHERE Email = ? AND Password = ?';
  db.query(sql, [email, login_password], (err, result) => {
    if (err) {
      console.error('Error executing login query:', err);
      return res.status(500).send('Internal Server Error');
    }
    if (result.length > 0) {
      loggedInUserID = result[0].UserID;
      res.redirect('/dashboard');
    } else {
      res.status(401).send('Invalid email or password');
    }
  });
});

app.post('/adminlogin', (req, res) => {
  const { ademail, adlogin_password } = req.body;
  const sql = 'SELECT * FROM Admin WHERE Email = ? AND Password = ?';
  db.query(sql, [ademail, adlogin_password], (err, result) => {
    if (err) {
      console.error('Error executing login query:', err);
      return res.status(500).send('Internal Server Error');
    }
    if (result.length > 0) {
      res.redirect('/admin-reg'); // Redirect to admin registrations page
    } else {
      res.status(401).send('Invalid email or password');
    }
  });
});

app.get('/dashboard', (req, res) => {
  const recentRegistrationsQuery = `
    SELECT 
      Registration.RegistrationID,
      Vehicle.Model AS VehicleMake
    FROM Registration 
    INNER JOIN Vehicle ON Registration.VehicleID = Vehicle.VehicleID 
    INNER JOIN Owner ON Vehicle.OwnerID = Owner.OwnerID 
    WHERE Owner.UserID = ? 
    ORDER BY Registration.RegistrationDate DESC
    LIMIT 3`;

  const remainingFinesQuery = `
    SELECT 
      Fines.FineID,
      Fines.FineAmount
    FROM Fines
    INNER JOIN Vehicle ON Fines.VehicleID = Vehicle.VehicleID
    INNER JOIN Owner ON Vehicle.OwnerID = Owner.OwnerID
    WHERE Owner.UserID = ?
    LIMIT 3`;

  db.query(recentRegistrationsQuery, [loggedInUserID], (err, recentRegistrations) => {
    if (err) {
      console.error('Error fetching recent registrations:', err);
      return res.status(500).send('Internal Server Error');
    }

    db.query(remainingFinesQuery, [loggedInUserID], (err, remainingFines) => {
      if (err) {
        console.error('Error fetching remaining fines:', err);
        return res.status(500).send('Internal Server Error');
      }

      res.render('dashboard', { recentRegistrations, remainingFines });
    });
  });
});

app.post('/register', (req, res) => {
  const { fullname, email, register_password, confirm_password } = req.body;
  if (register_password !== confirm_password) {
    return res.status(400).send('Passwords do not match');
  }
  
  const registrationDate = new Date().toISOString().slice(0, 10);

  const newUser = {
    Username: fullname,
    Password: register_password,
    Email: email,
    RegistrationDate: registrationDate
  };

  const sql = 'INSERT INTO User SET ?';
  db.query(sql, newUser, (err, result) => {
    if (err) {
      console.error('Error registering user:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/login.html');
  });
});

app.post('/registration', (req, res) => {
  const { name, email, phonenumber, address, tempplate, make, year } = req.body;

  const ownerData = {
    UserID: loggedInUserID,
    PhoneNumber: phonenumber,
    Name: name,
    Email: email,
    Address: address
  };

  db.query('INSERT INTO Owner SET ?', ownerData, (err, result) => {
    if (err) {
      res.status(500).send('Internal Server Error');
      throw err;
    }

    const ownerID = result.insertId;

    const vehicleData = {
      TempPlate: tempplate,
      Model: make,
      Year: year,
      OwnerID: ownerID
    };

    db.query('INSERT INTO Vehicle SET ?', vehicleData, (err, result) => {
      if (err) {
        res.status(500).send('Internal Server Error');
        throw err;
      }

      const registrationData = {
        VehicleID: result.insertId,
        RegistrationDate: new Date(),
        ExpiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        Status: 'Not Approved'
      };

      db.query('INSERT INTO Registration SET ?', registrationData, (err, result) => {
        if (err) {
          res.status(500).send('Internal Server Error');
          throw err;
        }
        
        res.send('Registration successful');
      });
    });
  });
});

app.get('/registrations', (req, res) => {
  const sql = `
    SELECT 
      RegistrationID, 
      Vehicle.Model AS VehicleMake, 
      Vehicle.TempPlate AS TemporaryNumberPlate, 
      Vehicle.PermanentPlate AS PermanentNumberPlate, 
      Vehicle.Year AS VehicleYear, 
      RegistrationDate, 
      ExpiryDate,
      Status
    FROM Registration 
    INNER JOIN Vehicle ON Registration.VehicleID = Vehicle.VehicleID 
    INNER JOIN Owner ON Vehicle.OwnerID = Owner.OwnerID 
    WHERE Owner.UserID = ?`;

  db.query(sql, [loggedInUserID], (err, registrations) => {
    if (err) {
      console.error('Error fetching registrations:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.render('registrations', { registrations });
  });
});

app.post('/submit-feedback', (req, res) => {
  const { feedback } = req.body;

  const newFeedback = {
    UserID: loggedInUserID,
    FeedbackText: feedback,
    FeedbackDate: new Date()
  };

  const sql = 'INSERT INTO Feedback SET ?';
  db.query(sql, newFeedback, (err, result) => {
    if (err) {
      console.error('Error submitting feedback:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/dashboard');
  });
});

app.get('/fines', (req, res) => {
  const finesQuery = `
    SELECT 
      Fines.FineID,
      Vehicle.Model AS VehicleMake,
      Fines.FineAmount,
      Fines.FineDate,
      Fines.Description
    FROM Fines
    INNER JOIN Vehicle ON Fines.VehicleID = Vehicle.VehicleID
    INNER JOIN Owner ON Vehicle.OwnerID = Owner.OwnerID
    WHERE Owner.UserID = ?`;

  db.query(finesQuery, [loggedInUserID], (err, fines) => {
    if (err) {
      console.error('Error fetching fines:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.render('fines', { fines });
  });
});

app.get('/admin-reg', (req, res) => {
  const sql = `
    SELECT 
      RegistrationID, 
      Vehicle.Model AS VehicleMake, 
      Vehicle.TempPlate AS TemporaryNumberPlate, 
      Vehicle.PermanentPlate AS PermanentNumberPlate, 
      Vehicle.Year AS VehicleYear, 
      RegistrationDate, 
      ExpiryDate,
      Status,
      Owner.Name AS OwnerName
    FROM Registration 
    INNER JOIN Vehicle ON Registration.VehicleID = Vehicle.VehicleID 
    INNER JOIN Owner ON Vehicle.OwnerID = Owner.OwnerID`;

  db.query(sql, (err, registrations) => {
    if (err) {
      console.error('Error fetching registrations:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.render('admin-reg', { registrations });
  });
});

app.post('/edit-registration', (req, res) => {
    currentRegistrationID = req.body.registrationID;
    res.redirect('/editreg.html');
});

app.post('/update-registration', (req, res) => {
  const { PermanentPlate, status } = req.body;

  const sql = `
    UPDATE Registration 
    INNER JOIN Vehicle ON Registration.VehicleID = Vehicle.VehicleID
    SET Vehicle.PermanentPlate = ?, Registration.Status = ?
    WHERE Registration.RegistrationID = ?`;

  db.query(sql, [PermanentPlate, status, currentRegistrationID], (err, result) => {
    if (err) {
      console.error('Error updating registration details:', err);
      return res.status(500).send('Internal Server Error');
    }

    currentRegistrationID = null;
    res.redirect('/admin-reg');
  });
});

app.post('/disapprove-registration', (req, res) => {
  const registrationID = req.body.registrationID;

  const sql = `DELETE FROM Registration WHERE RegistrationID = ?`;

  db.query(sql, [registrationID], (err, result) => {
    if (err) {
      console.error('Error disapproving registration:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/admin-reg');
  });
});


app.get('/admin-fines', (req, res) => {
  const query = `
    SELECT 
      F.FineID,
      O.Name AS OwnerName,
      V.PermanentPlate AS VehicleNumber,
      V.Model AS VehicleMake,
      F.FineAmount,
      F.Description AS Violation
    FROM Fines F
    INNER JOIN Vehicle V ON F.VehicleID = V.VehicleID
    INNER JOIN Owner O ON V.OwnerID = O.OwnerID
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching fines data: ' + err.stack);
      res.status(500).send('Error fetching fines data');
      return;
    }
    res.render('admin-fines', { fines: results });
  });
});

app.post('/omit-fine', (req, res) => {
  const fineID = req.body.fineID;

  const sql = `DELETE FROM Fines WHERE FineID = ?`;

  db.query(sql, [fineID], (err, result) => {
    if (err) {
      console.error('Error omitting fine:', err);
      return res.status(500).send('Internal Server Error');
    }

    res.redirect('/admin-fines');
  });
});



app.post('/edit-fine', (req, res) => {
  currentFineID = req.body.fineID;
  res.redirect('/editfine.html');
});

app.post('/update-fine', (req, res) => {
  const { fineamount, description } = req.body;

  const sql = `
    UPDATE Fines 
    SET FineAmount = ?, Description = ?
    WHERE FineID = ?`;

  db.query(sql, [fineamount, description, currentFineID], (err, result) => {
    if (err) {
      console.error('Error updating fine details:', err);
      return res.status(500).send('Internal Server Error');
    }

    currentFineID = null;
    res.redirect('/admin-fines');
  });
});


app.get('/admin-feedback', (req, res) => {
  const sql = `
      SELECT FeedbackID, Username, FeedbackText, FeedbackDate
      FROM Feedback
      INNER JOIN User ON Feedback.UserID = User.UserID
  `;

  db.query(sql, (err, feedbacks) => {
      if (err) {
          console.error('Error fetching feedback details:', err);
          return res.status(500).send('Internal Server Error');
      }
      res.render('admin-feedback', { feedbacks: feedbacks });
  });
});

app.post('/new-fine', (req, res) => {
  const { vehicleid, fineamount, description } = req.body;
  const sql = 'INSERT INTO Fines (VehicleID, FineAmount, FineDate, Description) VALUES (?, ?, CURDATE(), ?)';
  db.query(sql, [vehicleid, fineamount, description], (err, result) => {
    if (err) {
      console.error('Error creating new fine:', err);
      return res.status(500).send('Internal Server Error');
    }
    console.log('New fine created successfully');
    res.redirect('/admin-fines');
  });
});

app.post('/redirect-to-payment', (req, res) => {
  const { fineID } = req.body;
  const sql = 'SELECT FineAmount FROM Fines WHERE FineID = ?';
  db.query(sql, [fineID], (err, result) => {
      if (err) {
          throw err;
      }

      if (result.length > 0) {
          const fineAmount = result[0].FineAmount
          currentFineID = fineID;
          res.render('payment', { fineAmount });
      } else {
          console.log('No fine found with the provided ID');
          res.status(404).send('Fine not found');
      }
  });
});

app.post('/pay', (req, res) => {
  if (currentFineID) {
      const deleteQuery = 'DELETE FROM Fines WHERE FineID = ?';
      db.query(deleteQuery, [currentFineID], (deleteErr, deleteResult) => {
          if (deleteErr) {
              console.error('Error deleting fine:', deleteErr);
              res.status(500).send('An error occurred while processing your request');
              return;
          }
          res.send('<script>alert("Payment successful"); window.location.href="/fines";</script>');
      });
      currentFineID = null;
  } else {
      res.status(400).send('Invalid fine ID');
  }
});

app.get('/', (req, res) => {
  if (loggedInUserID) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'pages', 'homepage.html'));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

