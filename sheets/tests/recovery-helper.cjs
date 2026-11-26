const fs = require('node:fs');
const path = require('node:path');

// Assert durability on disk, not translated/hidden success messages in the UI.
module.exports = function recoverySnapshots(profile) {
  const directory = path.join(profile, 'sheet-recovery');
  try {
    return fs
      .readdirSync(directory)
      .filter(name => name.endsWith('.json'))
      .map(
        name =>
          JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
            .snapshot,
      );
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};
