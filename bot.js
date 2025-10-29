// bot.js
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "baileys"
import { Boom } from "@hapi/boom"
import qrcode from "qrcode-terminal"
import P from "pino"
import fs from "fs"
import path from "path"

// File penyimpanan laporan
const LAPORAN_FILE = "./laporan.json"
const UPLOAD_DIR = "./uploads"

// Pastikan folder uploads ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR)
}

// Fungsi bantu baca/simpan laporan
function loadLaporan() {
  try {
    const data = fs.readFileSync(LAPORAN_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return { laporan: [], counter: 1 }
  }
}

function saveLaporan(data) {
  fs.writeFileSync(LAPORAN_FILE, JSON.stringify(data, null, 2), "utf-8")
}

// Load data awal
let { laporan, counter } = loadLaporan()

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    browser: ["DISPERKIM Bot", "Chrome", "1.0.0"],
  })

  // QR Code login
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) {
      console.clear();
      console.log("📲 Scan QR code dengan WhatsApp Anda.");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        startBot()
      } else {
        console.log("❌ Logout. Hapus folder auth_info untuk login ulang.")
      }
    } else if (connection === "open") {
      console.log("✅ Bot DISPERKIM aktif!")
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // Pesan masuk
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    let text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      ""

    console.log(`📩 Pesan dari ${from}: ${text}`)

    // === MENU UTAMA ===
    if (/^halo$/i.test(text) || /^menu$/i.test(text)) {
      await sock.sendMessage(from, {
        text: `👋 Selamat datang di *Chatbot DISPERKIM Kota Semarang*  
Silakan pilih layanan:
1️⃣ Laporan Pohon Tumbang
2️⃣ Laporan Taman Kota
3️⃣ Informasi Lainnya`,
      })
      return
    }

    // === LAPORAN POHON ===
    if (text === "1") {
      await sock.sendMessage(from, {
        text: `🌳 *Laporan Pohon Tumbang*  
Format:
LOKASI: [alamat/lokasi]
WAKTU: [tanggal & jam]
KONTAK: [nomor HP]
KETERANGAN: [opsional]
📸 Anda juga bisa kirim foto kondisi pohon.`,
      })
      return
    }

    // === LAPORAN TAMAN ===
    if (text === "2") {
      await sock.sendMessage(from, {
        text: `🌺 *Laporan Taman Kota*  
Format:
TAMAN: [nama/alamat taman]
MASALAH: [fasilitas rusak/kebersihan/lainnya]
KONTAK: [nomor HP]
KETERANGAN: [opsional]
📸 Anda juga bisa kirim foto kondisi taman.`,
      })
      return
    }

    // === INFORMASI ===
    if (text === "3") {
      await sock.sendMessage(from, {
        text: `ℹ️ Informasi DISPERKIM Kota Semarang:  
🌐 Website: https://disperkim.semarangkota.go.id  
☎️ Call Center: (024) 123456  
📧 Email: disperkim@semarangkota.go.id  

Ketik *menu* untuk kembali.`,
      })
      return
    }

    // === SIMPAN LAPORAN (TEXT / FOTO) ===
    if (/^lokasi:/i.test(text) || /^taman:/i.test(text) || msg.message.imageMessage) {
      const id = counter++
      let filePath = null

      // Jika ada foto, simpan ke folder uploads
      if (msg.message.imageMessage) {
        const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: P() })
        filePath = path.join(UPLOAD_DIR, `laporan_${id}.jpg`)
        fs.writeFileSync(filePath, buffer)
      }

      laporan.push({
        id,
        from,
        isi: text || "Laporan dengan foto tanpa teks",
        foto: filePath,
        status: "Menunggu verifikasi",
        waktu: new Date().toISOString(),
      })
      saveLaporan({ laporan, counter })

      await sock.sendMessage(from, {
        text: `✅ Laporan Anda dicatat.  
Nomor laporan: *#${id}*  
Gunakan perintah: CEK #${id} untuk cek status.`,
      })
      return
    }

    // === CEK STATUS ===
    if (/^cek #\d+$/i.test(text)) {
      const id = parseInt(text.replace(/cek #/i, ""))
      const item = laporan.find((l) => l.id === id)
      if (item) {
        let reply = `📌 Status laporan *#${id}*:  
Isi: ${item.isi}  
Status: *${item.status}*`
        await sock.sendMessage(from, { text: reply })

        // Jika ada foto laporan, kirim balik
        if (item.foto && fs.existsSync(item.foto)) {
          await sock.sendMessage(from, {
            image: fs.readFileSync(item.foto),
            caption: `Foto laporan #${id}`,
          })
        }
      } else {
        await sock.sendMessage(from, { text: "❌ Nomor laporan tidak ditemukan." })
      }
      return
    }

    // === DEFAULT ===
    await sock.sendMessage(from, {
      text: `🙏 Maaf, saya tidak mengerti.  
Ketik *menu* untuk melihat pilihan.`,
    })
  })
}

startBot()
