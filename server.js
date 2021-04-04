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
const spotifyDefaults = () => {
  return {
    redirectUri:
      process.env.NODE_ENV === "production"
        ? "/play/"
        : "http://localhost:3000/play/",
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  };
};

app.post("/api/v1/refresh", (req, res) => {
  const refreshToken = req.body.refreshToken;
  console.log({...spotifyDefaults()});
  const spotifyApi = new SpotifyWebApi({
    refreshToken,
    ...spotifyDefaults(),
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
      console.log(err);
      res.status(400).json({ status: err.status });
    });
});

app.post("/api/v1/login", (req, res) => {
  const code = req.body.code;
  console.log({...spotifyDefaults()});
  const spotifyApi = new SpotifyWebApi({
    ...spotifyDefaults(),
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
      console.log(err);
      res.status(400).json({ status: err.status });
    });
});

app.post("/api/v1/GetLyric", async (req, res) => {
  const { artist, track_name, track_uri, track_image_url } = req.body;
  db.query("SELECT lyrics FROM song WHERE track_uri = $1 ", [track_uri])
    .then((selectData) => {
      if (selectData.rows[0] && selectData.rows[0].lyrics)
        res.status(200).json({
          lyrics: selectData.rows[0].lyrics,
          status: "Success - Kayıtlı",
        });
      else
        lyricsFinder(artist, track_name)
          .then((lyrics) => {
            if (!lyrics)
              return res.status(200).json({
                lyrics:
                  "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
                status:
                  "Fail - Sözler yok bir daha bulmayı deneyecek. Bulursa kaydedicek",
              });

            if (selectData.rows[0]) {
              db.query(`UPDATE song SET lyrics = $1 WHERE track_uri = $2 `, [
                lyrics,
                track_uri,
              ])
                .then((data) => {
                  res.status(200).json({
                    lyrics: lyrics,
                    status: "Success - Kayıtlı (Update Etti)",
                  });
                })
                .catch((err) => {
                  console.log(err);
                  res.status(200).json({
                    lyrics:
                      "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
                    status: "Fail - Update patladı",
                  });
                });
            } else {
              db.query(
                `INSERT INTO song (artist,track,lyrics,track_uri,track_image_url) VALUES($1,$2,$3,$4,$5)`,
                [artist, track_name, lyrics, track_uri, track_image_url]
              )
                .then(() => {
                  res.status(200).json({
                    lyrics,
                    status: "Success - Kayıtlı (Insert Etti)",
                  });
                })
                .catch((err) => {
                  console.log(err);
                  res.status(200).json({
                    lyrics:
                      "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
                    status: "Fail - Insert patladı",
                  });
                });
            }
          })
          .catch((err) => {
            console.log(err);
            res.status(200).json({
              lyrics: "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
              status: "Fail - LyricsFinder patladı",
              message: err.message,
            });
          });
    })
    .catch((err) => {
      res.status(200).json({
        lyrics: "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
        status: "Fail - servis patladı",
        message: err.message,
      });
    });
});

app.post("/api/v1/GetAllSong", (req, res) => {
  db.query("SELECT * FROM Song ORDER BY ID desc")
    .then((data) => {
      res.status(200).json({
        data: data.rows,
        status: "Success",
        totalCount: data.rows.length,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(400).json({ status: err });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
