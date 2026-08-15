const { validationResult } = require('express-validator');

// Runs after express-validator check(...) chains; short-circuits with 400 on bad input.
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
  }
  next();
}

module.exports = { validate };
