// =============================================================================
// Vercel serverless function: GET /api/investors
// Returns the lightweight list of investors for the frontend's corpus dropdown.
// =============================================================================

const fs = require('fs');
const path = require('path');

let KB = null;
function getKB() {
  if (!KB) {
    const kbPath = path.join(process.cwd(), 'investors.json');
    KB = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  }
  return KB;
}

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const kb = getKB();
    res.status(200).json({
      count: kb.investors.length,
      investors: kb.investors.map(i => ({ name: i.name, firm: i.firm, role: i.role })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load corpus.' });
  }
};
