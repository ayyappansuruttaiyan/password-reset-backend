const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const ejs = require("ejs");
const path = require("path");
const cors = require("cors");
const Joi = require("joi");

const app = express();
const PORT = process.env.PORT || 5000;

// Load environment variables
dotenv.config();

// middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, "build")));

//mongodb connection
mongoose
  .connect(process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI)
  .then((response) => {
    console.log("db connected successfully");
  })
  .catch((error) => {
    console.log(error);
  });

app.set("view engine", "ejs"); // Set EJS as the template engine
app.set("views", path.join(__dirname, "views")); // Set the views directory

// User schema
const userSchema = mongoose.Schema({
  email: { type: String, required: true },
  randomString: String,
  password: { type: String, required: true },
  resetStringTimestamp: Date,
});
const User = mongoose.model("User", userSchema);

// Node Mailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.USER_NAME,
    pass: process.env.USER_PASSWORD,
  },
});

// routes

//routes for crud operation
app.post("/api/register", async (req, res) => {
  const { email, randomString = "", password } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    res.status(400).json({ message: "User already exists" });
    return;
  }
  const newUser = new User({ email, randomString, password });
  try {
    await newUser.save();
    res.status(200).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  // check if the user exists in the db
  const user = await User.findOne({ email });
  console.log(user);
  if (!user) {
    res.status(400).json({ message: "User Not Found" });
    return;
  }

  // if user found , generate random string
  const randomString = Math.random().toString(36).substring(7);
  const resetStringTimestamp = new Date(); // set the time when random string generated
  // store the random string in the db with the respective user and time also
  user.randomString = randomString;
  user.resetStringTimestamp = resetStringTimestamp;
  await user.save();

  // send mail with the random string for the particular user
  const mailOptions = {
    from: "ayyappan.sjec@gmail.com",
    to: user.email,
    subject: "Password Reset",
    text: `Click the following link to reset your password: http://localhost:5000/api/reset-password/${randomString}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending mail:", error);
      res.status(500).json({ message: "Error sending mail" });
      return;
    }
    res.status(200).json({ message: "Email sent. check your inbox" });
    return;
  });
});

app.get("/api/reset-password/:randomString", async (req, res) => {
  const { randomString } = req.params;

  // check if the random string exists in the databse
  const user = await User.findOne({ randomString });

  if (!user) {
    return res.status(404).json({ message: "Invalid Link" });
  }

  const timeDifference = new Date() - user.resetStringTimestamp;
  const timeLimit = 1 * 60 * 1000; // 2 minutes in milliseconds

  if (timeDifference > timeLimit) {
    return res
      .status(400)
      .send(`<p>Time limit exceeded. Request a new link</p>`);
  }
  // if the randomstring matches, display the password reset form
  res.send(`
  <form action="/api/reset-password/${randomString}" method="post" enctype="application/x-www-form-urlencoded">
    <label for="newPassword">New Password:</label>
    <input type="password" value="" id="newPassword" name="newPassword" required>
    <button type="submit">Reset Password</button>
  </form>
`);
});

app.post("/api/reset-password/:randomString", async (req, res) => {
  console.log(req.body);
  const { randomString } = req.params;
  const { newPassword } = req.body;

  // find the user by random string
  const user = await User.findOne({ randomString });

  if (!user) {
    res.status(404).send("Invalid link");
    return;
  }

  // if user matches store the new password and clear the random string in the db
  user.password = newPassword;
  user.randomString = null;
  try {
    await user.save();
    res.status(200).send(`
  <html>
    <head>
      <meta http-equiv="refresh" content="10;url=http://localhost:5173/">
      <script>
        var countdown = 10;

        function updateCountdown() {
          countdown--;
          document.getElementById('countdown').innerHTML = countdown;

          if (countdown <= 0) {
            window.location.href = 'http://localhost:5173/';
          } else {
            setTimeout(updateCountdown, 1000);
          }
        }

        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(updateCountdown, 1000);
        });
      </script>
    </head>
    <body style="text-align: center; padding: 20px; background-color: #e1f0da; color: #294b29;">
      <h2>Password Reset Successful</h2>
      <p>Your password has been reset successfully. Redirecting to <a href="http://localhost:5173/">Home</a> in <span id="countdown">10</span> seconds...</p>
    </body>
  </html>
`);
  } catch (error) {
    res.status(400).send(error);
  }
});

//server
app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
