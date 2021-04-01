require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const lyricsFinder = require("lyrics-finder");
const SpotifyWebApi = require("spotify-web-api-node");
const helmet = require("helmet");
const compression = require("compression");
const db = require("./db");

//Middleware START
const app = express();
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(morgan("dev"));
app.use((req, res, next) => {
  //burada her hangi bir işlem yapabiliriz
  next();
});
//Middleware END

const spotifyDefaults = {
  redirectUri: process.env.REDIRECT_URI,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
};

app.post("/refresh", (req, res) => {
  const refreshToken = req.body.refreshToken;
  const spotifyApi = new SpotifyWebApi({
    refreshToken,
    ...spotifyDefaults,
  });

  spotifyApi
    .refreshAccessToken()
    .then((data) => {
      res.status(200).json({
        accessToken: data.body.accessToken,
        expiresIn: data.body.expiresIn,
      });
    })
    .catch((err) => {
      res.status(400).json({ status: err.status });
    });
});

app.post("/login", (req, res) => {
  const code = req.body.code;
  console.log(req.body);
  const spotifyApi = new SpotifyWebApi({
    ...spotifyDefaults,
  });
  spotifyApi
    .authorizationCodeGrant(code)
    .then((data) => {
      res.status(200).json({
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token,
        expiresIn: data.body.expires_in,
      });
    })
    .catch((err) => {
      res.status(400).json({ status: err.status });
    });
});

app.post("/GetLyric", async (req, res) => {
  const { artist, track } = req.body;
  db.query(
    `SELECT lyrics FROM song WHERE artist = '${artist}' AND track = '${track}' `
  )
    .then((data) => {
      if (data.rows[0])
        res.status(200).json({
          lyrics: data.rows[0].lyrics,
          status: "Success",
          totalCount: data.rows.length,
        });
      else {
        lyricsFinder(artist, track)
          .then((lyrics) => {
            db.query(
              `INSERT INTO song (artist,track,lyrics) VALUES($1,$2,$3)`,
              [artist, track, lyrics]
            ).then((data) => {
              res.status(200).json({
                lyrics,
                status: "Success",
                totalCount: data.rows.length,
              });
            });
          })
          .catch((err) => {
            res.status(200).json({
              lyrics: "Şarkı sözleri bulunamadı",
              status: "Fail",
              message: err.message,
            });
          });
      }
    })
    .catch((err) => {
      console.log(err.message);
      res.status(400).json({ status: err });
    });
});

app.post("/GetAllSong", (req, res) => {
  db.query("SELECT * FROM Song")
    .then((data) => {
      res.status(200).json({
        data: data.rows,
        status: "Success",
        totalCount: data.rows.length,
      });
    })
    .catch((err) => {
      res.status(400).json({ status: err });
    });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
