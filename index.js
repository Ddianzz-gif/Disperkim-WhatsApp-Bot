import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Autentikasi Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// Fungsi simpan laporan ke Google Sheets
async function simpanLaporan(jenis, nama, lokasi, keterangan, nomor) {
  const values = [[new Date().toISOString(), nomor, jenis, nama, lokasi, keterangan]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "Laporan!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

// Fungsi kirim pesan WhatsApp
async function kirimPesan(to, body) {
  await fetch(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body },
    }),
  });
}

// Verifikasi webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Pesan masuk dari WhatsApp
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (message && message.text) {
    const from = message.from;
    const text = message.text.body.trim();

    let reply;

    if (text === "1") {
      reply = "Silakan isi laporan taman dengan format:\nNAMA; LOKASI; KETERANGAN";
    } else if (text === "2") {
      reply = "Silakan isi laporan pohon tumbang dengan format:\nNAMA; LOKASI; KETERANGAN";
    } else if (text.includes(";")) {
      // Parsing data laporan
      const [nama, lokasi, keterangan] = text.split(";").map((t) => t.trim());
      const nomorTiket = `DISP-${Date.now()}`;

      const jenis = entry.messages[0].context?.id === "1" ? "Taman" : "Pohon Tumbang";

      await simpanLaporan(jenis, nama, lokasi, keterangan, nomorTiket);

      reply = `✅ Terima kasih, laporan Anda sudah kami terima.\nNomor Tiket: ${nomorTiket}`;
    } else if (text === "3") {
      reply = "Kontak DISPERKIM Kota Semarang:\n📍 Jl. Pemuda No.148, Semarang\n☎️ (024) xxx-xxxx";
    } else {
      reply = "Halo 👋, Anda terhubung dengan DISPERKIM Kota Semarang.\nKetik angka:\n1️⃣ Laporan Taman\n2️⃣ Laporan Pohon Tumbang\n3️⃣ Informasi Kontak";
    }

    await kirimPesan(from, reply);
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("✅ Chatbot DISPERKIM aktif di port 3000"));
