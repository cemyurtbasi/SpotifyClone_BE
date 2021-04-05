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
const spotifyDefaults = (headers) => {
  return {
    redirectUri: `${headers.origin}/play/`,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  };
};

app.post("/api/v1/refresh", async ({ body, headers }, res) => {
  try {
    const { refreshToken } = body;
    const spotifyApi = new SpotifyWebApi({
      refreshToken,
      ...spotifyDefaults(headers),
    });

    const spotifyApiResponse = await spotifyApi.refreshAccessToken();
    const { body } = spotifyApiResponse;
    res.status(200).json({
      accessToken: body.accessToken,
      expiresIn: body.expiresIn,
    });
  } catch (error) {
    console.log(error);
    res.status(200).json({ error: error.message });
  }
});

app.post("/api/v1/login", async ({ body, headers }, res) => {
  try {
    const code = body.code;
    if (!code) return res.status(404).json({ error: "Code yok" });

    const spotifyApi = new SpotifyWebApi({ ...spotifyDefaults(headers) });
    const spotifyApiResponse = await spotifyApi.authorizationCodeGrant(code);

    const { access_token, refresh_token, expires_in } = spotifyApiResponse.body;

    res.status(200).json({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
    });
  } catch (error) {
    console.log(error);
    res.status(200).json({ error: error.message });
  }
});

app.post("/api/v1/GetLyric", async ({ body }, res) => {
  try {
    const { artist, track_name, track_uri, track_image_url } = body;
    const seletedSong = await db.query(
      "SELECT id,lyrics FROM song WHERE track_uri = $1 ",
      [track_uri]
    );
    if (seletedSong.rows[0] && seletedSong.rows[0].lyrics)
      res.status(200).json({
        lyrics: seletedSong.rows[0].lyrics,
        status: "Success - Kayıtlı",
      });

    const lyrics = await lyricsFinder(artist, track_name);
    if (seletedSong.rows[0] && lyrics)
      await db.query(
        `UPDATE song SET lyrics = $1 WHERE track_uri = $2 `,
        [lyrics, track_uri]
      );

    if (!seletedSong.rows[0])
      await db.query(
        `INSERT INTO song (artist,track,lyrics,track_uri,track_image_url) VALUES($1,$2,$3,$4,$5)`,
        [artist, track_name, lyrics, track_uri, track_image_url]
      );

    res.status(200).json({
      lyrics:
        lyrics || "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
      status: "Success",
    });
  } catch (error) {
    console.log(error);
    res.status(200).json({ error: error.message });
  }
});

app.post("/api/v1/GetAllSong", async (req, res) => {
  try {
    const songs = await db.query("SELECT * FROM Song ORDER BY ID desc");
    res.status(200).json({
      data: songs.rows,
      status: "Success",
      totalCount: songs.rows.length,
    });
  } catch (error) {
    console.log(error);
    res.status(200).json({
      lyrics: "Şarkı sözleri bulunamadı. Daha sonra tekrar deneyiniz.",
      status: "Fail - Service Error",
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
