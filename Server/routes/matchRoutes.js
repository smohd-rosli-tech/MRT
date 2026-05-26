/***************************
 * Match Routes
 *
 * Handles fetching and saving match data.
 ***************************/
const express = require('express')
const router = express.Router()
const Match = require('../models/Match')
const { dbLogger } = require('../modules/logger')

/**
 * Normalize incoming payload so it matches Mongo shape
 */
function normalizeMatchPayload(payload = {}) {
  return {
    ...payload,
    dynamic_fields: payload.dynamic_fields || {},
    match_players: Array.isArray(payload.match_players)
      ? payload.match_players.map((player) => ({
          ...player,
          dynamic_fields: player.dynamic_fields || {},
          badge_ids: Array.isArray(player.badge_ids) ? player.badge_ids : null,
          player_heroes: Array.isArray(player.player_heroes)
            ? player.player_heroes.map((hero) => ({
                ...hero,
                add_dynamic_fields:
                  hero.add_dynamic_fields === undefined ? null : hero.add_dynamic_fields,
              }))
            : [],
        }))
      : [],
  }
}

/**
 * GET /api/matches
 * Get latest matches (limited for performance)
 */
router.get('/', async (req, res) => {
  try {
    const matches = await Match.find()
      .sort({ match_time_stamp: -1 })
      // .limit(50) // 🔥 prevent huge payload
      .lean()

    res.json(matches)
  } catch (err) {
    dbLogger.error('Error fetching matches:', err)
    res.status(500).json({
      message: 'Failed to get matches',
      error: err.message,
    })
  }
})

/**
 * GET /api/matches/:match_uid
 * Get full match by UID
 */
// router.get('/:id', async (req, res) => {
//   try {
//     const { id } = req.params

//     const match = await Match.findOne({ _id: id }).lean()

//     if (!match) {
//       dbLogger.warn(`Match not found: ${id}`)
//       return res.status(404).json({ message: 'Match not found' })
//     }

//     res.json(match)
//   } catch (err) {
//     dbLogger.error(`Error fetching match ${req.params.id}:`, err)
//     res.status(500).json({
//       message: 'Failed to get match',
//       error: err.message,
//     })
//   }
// })

router.get('/:match_uid', async (req, res) => {
  try {
    const { match_uid } = req.params

    const match = await Match.findOne({ match_uid }).lean()

    if (!match) {
      dbLogger.warn(`Match not found: ${match_uid}`)
      return res.status(404).json({ message: 'Match not found' })
    }

    res.json(match)
  } catch (err) {
    dbLogger.error(`Error fetching match ${req.params.match_uid}:`, err)
    res.status(500).json({
      message: 'Failed to get match',
      error: err.message,
    })
  }
})

/**
 * POST /api/matches/save
 * Save or update single match
 */
router.post('/save', async (req, res) => {
  try {
    const payload = req.body

    if (!payload || typeof payload.match_uid !== 'string') {
      return res.status(400).json({
        message: 'match_uid is required',
      })
    }

    const normalized = normalizeMatchPayload(payload)

    const saved = await Match.findOneAndUpdate(
      { match_uid: normalized.match_uid },
      { $set: normalized },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    )

    res.json(saved)
  } catch (err) {
    dbLogger.error('Error saving match:', err)
    res.status(500).json({
      message: 'Failed to save match',
      error: err.message,
    })
  }
})

/**
 * POST /api/matches/save-many
 * Bulk save matches
 */
router.post('/save-many', async (req, res) => {
  try {
    const rawMatches = Array.isArray(req.body) ? req.body : req.body.matches

    if (!Array.isArray(rawMatches) || rawMatches.length === 0) {
      return res.status(400).json({
        message: 'matches array is required',
      })
    }

    const normalizedMatches = rawMatches
      .filter((m) => m && m.match_uid)
      .map((m) => normalizeMatchPayload(m))

    if (normalizedMatches.length === 0) {
      return res.status(400).json({
        message: 'No valid matches found',
      })
    }

    const operations = normalizedMatches.map((match) => ({
      updateOne: {
        filter: { match_uid: match.match_uid },
        update: { $set: match },
        upsert: true,
      },
    }))

    const result = await Match.bulkWrite(operations, { ordered: false })

    res.json({
      message: 'Bulk save completed',
      count: normalizedMatches.length,
      result,
    })
  } catch (err) {
    dbLogger.error('Error bulk saving matches:', err)
    res.status(500).json({
      message: 'Failed to bulk save matches',
      error: err.message,
    })
  }
})

/**
 * DELETE /api/matches/:match_uid
 */
router.delete('/:match_uid', async (req, res) => {
  try {
    const { match_uid } = req.params

    const deleted = await Match.findOneAndDelete({ match_uid })

    if (!deleted) {
      dbLogger.warn(`Match not found for delete: ${match_uid}`)
      return res.status(404).json({ message: 'Match not found' })
    }

    res.json({
      message: 'Match deleted successfully',
      match_uid,
    })
  } catch (err) {
    dbLogger.error(`Error deleting match ${req.params.match_uid}:`, err)
    res.status(500).json({
      message: 'Failed to delete match',
      error: err.message,
    })
  }
})

module.exports = router