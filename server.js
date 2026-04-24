require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json({ limit: '2mb' }));

const GITHUB_OWNER = 'AyhamGhnaim';
const GITHUB_REPO  = 'SyDent';
const GITHUB_BRANCH = 'main';

async function getFileSha(filename, githubToken) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'sydent-server' } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

async function pushFileToGitHub(filename, content, githubToken) {
  const sha = await getFileSha(filename, githubToken);
  const body = {
    message: `Update ${filename} via API`,
    content: Buffer.from(content).toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha && { sha }),
  };

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'sydent-server',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

app.post('/update-file', async (req, res) => {
  const { filename, content, token } = req.body ?? {};

  if (!filename || content === undefined || !token) {
    return res.status(400).json({ error: 'Missing required fields: filename, content, token' });
  }

  if (token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return res.status(500).json({ error: 'Server misconfiguration: GITHUB_TOKEN not set' });
  }

  try {
    const result = await pushFileToGitHub(filename, content, githubToken);
    res.json({ ok: true, commit: result.commit?.sha });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
