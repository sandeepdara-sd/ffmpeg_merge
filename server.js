const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const app = express();
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "public")));

app.get("/",(req,res)=>{
  res.send("Api is working, go and merge now....")
})

app.post("/merge", async (req, res) => {
  const { video_urls } = req.body;

  if (!Array.isArray(video_urls) || video_urls.length === 0) {
    return res.status(400).json({ error: "Send exactly 6 video URLs" });
  }



  const tempDir = path.join(__dirname, "temp");
  const publicDir = path.join(__dirname, "public");
  await fs.ensureDir(tempDir);
  await fs.ensureDir(publicDir);

  const inputListPath = path.join(tempDir, "input.txt");

  try {
    // Download each video
    const downloadPromises = video_urls.map(async (url, idx) => {
      const filePath = path.join(tempDir, `scene${idx}.mp4`);
      const writer = fs.createWriteStream(filePath);
      const response = await axios({ method: "get", url, responseType: "stream" });
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      return `file '${filePath}'`;
    });

    const inputLines = await Promise.all(downloadPromises);
    await fs.writeFile(inputListPath, inputLines.join("\n"));

    const outputPath = path.join(publicDir, "merged.mp4");

    // Merge using FFmpeg (fast mode)
    await new Promise((resolve, reject) => {
      const command = `"${ffmpegPath}" -f concat -safe 0 -i "${inputListPath}" -c copy "${outputPath}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("FFmpeg error:", stderr);
          return reject(error);
        }
        resolve();
      });
    });

    res.json({
      success: true,
      url: `${req.protocol}://${req.get("host")}/static/merged.mp4`
    });

  } catch (err) {
    console.error("Merge failed:", err);
    res.status(500).json({ error: "Merge failed", details: err.message });
  } finally {
    await fs.remove(tempDir); // Clean temp files
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
