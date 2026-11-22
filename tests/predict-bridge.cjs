const fs = require('node:fs');
const { predictProfile } = require('../model.js');
const { model, profiles } = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(profiles.map(profile => predictProfile(model, profile))));
