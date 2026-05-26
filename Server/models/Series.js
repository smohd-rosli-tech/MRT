const mongoose = require("mongoose");

const { Schema } = mongoose;

const TeamInfoSchema = new Schema(
  {
    camp: Number,
    name: String,
    mini_name: String,
    icon_url: String,
    score: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const SeriesSchema = new Schema(
  {
    room_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    battle_id: String,

    max_bo: Number,
    cur_bo: Number,

    round_results: {
      type: [Number],
      default: [],
    },

    team1: {
      type: TeamInfoSchema,
      default: () => ({ camp: 1 }),
    },

    team2: {
      type: TeamInfoSchema,
      default: () => ({ camp: 2 }),
    },

    region: {
      type: String,
      default: 'GLOBAL',
    },

    matches: {
      type: [String],
      default: [],
    },

    raw_room_info: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: false,
    versionKey: false,
  }
);

module.exports = mongoose.model("Series", SeriesSchema);