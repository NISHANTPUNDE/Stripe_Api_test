require("dotenv").config();
const express = require("express");
const app = express();
const mysql = require("mysql2");
const cors = require("cors");
const msgRouter = require("./api/msgs/msg.router")
const bodyParser = require("body-parser");
app.use(cors());

app.use("/api", msgRouter);


app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
    }
);
