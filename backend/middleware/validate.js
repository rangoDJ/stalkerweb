'use strict'

const { param, query, body, validationResult } = require('express-validator')

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() })
  }
  next()
}

const channelIdRules = [
  param('channelId')
    .trim()
    .notEmpty().withMessage('Channel ID is required')
    .isInt({ min: 1 }).withMessage('Channel ID must be a positive integer'),
  validate,
]

const hlsUrlRules = [
  query('url')
    .notEmpty().withMessage('url parameter is required')
    .isString().withMessage('url must be a string'),
  validate,
]

const connectRules = [
  body('portal')
    .trim()
    .notEmpty().withMessage('Portal URL is required')
    .isURL({ require_protocol: true, protocols: ['http', 'https'] }).withMessage('Portal must be a valid HTTP(S) URL'),
  body('mac')
    .trim()
    .notEmpty().withMessage('MAC address is required')
    .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).withMessage('MAC must be a valid MAC address format (e.g. AA:BB:CC:DD:EE:FF)'),
  validate,
]

module.exports = { channelIdRules, hlsUrlRules, connectRules, validate }
