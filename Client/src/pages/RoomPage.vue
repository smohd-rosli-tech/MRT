<template>
  <q-page class="live-rooms-page q-pa-md bg-dark text-white">
    <div class="page-title q-mb-md">Live Rooms</div>

    <div class="toolbar q-mb-md">
      <q-btn
        color="blue-grey-8"
        icon="refresh"
        label="Refresh Rooms"
        @click="loadRooms"
        :loading="loading"
      />

      <q-input
        v-model="search"
        dense
        filled
        dark
        clearable
        placeholder="Search room ID, battle ID or team..."
        class="search-input"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-select
        v-model="region"
        :options="['GLOBAL', 'EMEA', 'AMERICAS']"
        label="Region"
        dark
        dense
        label-color="indigo-4"
        color="indigo-4"
        class="col-2"
        @update:model-value="seshStore.updateRegion(region)"
      />

      <q-toggle
        v-model="isTestMatch"
        checked-icon="check"
        color="deep-orange"
        label="Test Match"
        unchecked-icon="clear"
        @update:model-value="seshStore.updateTestMatch(isTestMatch)"
      />
    </div>

    <q-table
      flat
      bordered
      dark
      :rows="filteredRooms"
      :columns="columns"
      row-key="room_id"
      class="rooms-table"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <template #body-cell-round="props">
        <q-td :props="props">
          <q-badge rounded color="primary" :label="roundLabel(props.row)" />
        </q-td>
      </template>

      <template #body-cell-match="props">
        <q-td :props="props">
          <div class="match-name">{{ team1Name(props.row) }} vs {{ team2Name(props.row) }}</div>
          <div class="text-caption text-grey-5">Room ID: {{ props.row.room_id }}</div>
          <div class="text-caption text-grey-5">Battle ID: {{ props.row.battle_id || '-' }}</div>
        </q-td>
      </template>

      <template v-slot:body-cell-roundResults="props">
        <q-td :props="props">
          <div style="white-space: pre-line">
            {{ roundResultsLabel(props.row) }}
          </div>
        </q-td>
      </template>

      <template #body-cell-score="props">
        <q-td :props="props">
          <div class="score-row">
            <div class="score-team">
              <span class="team-mini">{{ team1MiniName(props.row) }}</span>
              <span class="team-score">{{ team1Score(props.row) }}</span>
            </div>
            <span class="score-separator">-</span>
            <div class="score-team">
              <span class="team-score">{{ team2Score(props.row) }}</span>
              <span class="team-mini">{{ team2MiniName(props.row) }}</span>
            </div>
          </div>
        </q-td>
      </template>

      <template #body-cell-meta="props">
        <q-td :props="props">
          <div>League: {{ leagueLabel(props.row) }}</div>
          <div class="text-caption text-grey-5">Players: {{ memberCount(props.row) }}</div>
        </q-td>
      </template>

      <template #body-cell-action="props">
        <q-td :props="props" class="text-center">
          <q-btn color="primary" unelevated label="Dashboard" @click="openDashboard(props.row)" />
          <q-btn
            color="secondary"
            unelevated
            label="Draft"
            @click="openDraft(props.row)"
            class="q-ml-sm"
          />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useSeshStore } from '../stores/sesh'

const seshStore = useSeshStore()
const router = useRouter()
const $q = useQuasar()

const loading = ref(false)
const search = ref('')
const rooms = ref([])
const region = ref('GLOBAL')
const isTestMatch = ref(false)

const columns = [
  { name: 'round', label: 'Round', field: 'cur_bo', align: 'center' },
  { name: 'match', label: 'Match', field: 'match', align: 'left' },
  { name: 'score', label: 'Score', field: 'score', align: 'center' },
  { name: 'roundResults', label: 'Round Result', field: 'roundResults', align: 'left' },
  { name: 'meta', label: 'Meta', field: 'meta', align: 'left' },
  { name: 'action', label: 'Action', field: 'action', align: 'center' },
]

const filteredRooms = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return rooms.value

  return rooms.value.filter((room) => {
    const haystack = [
      String(room.room_id || ''),
      String(room.battle_id || ''),
      team1Name(room),
      team2Name(room),
      team1MiniName(room),
      team2MiniName(room),
      leagueLabel(room),
      roundResultsLabel(room),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(keyword)
  })
})

async function loadRooms() {
  try {
    loading.value = true
    const response = await api.get('/live/rooms')

    const rawRooms =
      response.data?.data?.room_list ||
      response.data?.room_list ||
      response.data?.data ||
      response.data ||
      []

    rooms.value = Array.isArray(rawRooms) ? rawRooms : []
  } catch (err) {
    console.error('Failed to load rooms', err)
    rooms.value = []
    $q.notify({ type: 'negative', message: 'Error loading live rooms' })
  } finally {
    loading.value = false
  }
}

async function openDraft(room) {
  seshStore.updateRoom(String(room.room_id))
  await api.post('/live/active-room', {
    room_id: String(room.room_id),
  })
  console.log('Navigating to live draft with room id: ', room.room_id)
  router.push({ name: 'DraftPage' })
}

async function openDashboard(room) {
  seshStore.updateRoom(String(room.room_id))
  await api.post('/live/active-room', {
    room_id: String(room.room_id),
  })
  console.log('Navigating to live dashboard with room id: ', room.room_id)
  router.push({ name: 'DashboardPage' })
}

function getGroup(room, key) {
  return room?.group_info?.[key] || {}
}

function team1Name(room) {
  return getGroup(room, '1').name || 'Team 1'
}

function team2Name(room) {
  return getGroup(room, '2').name || 'Team 2'
}

function team1MiniName(room) {
  return getGroup(room, '1').mini_name || team1Name(room)
}

function team2MiniName(room) {
  return getGroup(room, '2').mini_name || team2Name(room)
}

function team1Score(room) {
  return getGroup(room, '1').score ?? 0
}

function team2Score(room) {
  return getGroup(room, '2').score ?? 0
}

function roundLabel(room) {
  const current = Number(room?.cur_bo ?? 0)
  const total = Number(room?.max_bo ?? 0)

  if (!total) return `BO ?`
  return `Game ${current + 1} / BO${total}`
}

function roundResultsLabel(room) {
  const results = Array.isArray(room?.round_results) ? room.round_results : []
  if (!results.length) return '-'

  const team1 = room?.group_info?.['1']
  const team2 = room?.group_info?.['2']

  return results
    .map((winner, index) => {
      const winnerName = winner === 1 ? team1?.mini_name : winner === 2 ? team2?.mini_name : '-'

      return `Round ${index + 1}: ${winnerName}`
    })
    .join('\n')
}

function leagueLabel(room) {
  return room?.league_tag || '-'
}

function memberCount(room) {
  return Array.isArray(room?.members) ? room.members.length : 0
}

onMounted(() => {
  loadRooms()
})
</script>

<style scoped>
.live-rooms-page {
  min-height: 100vh;
  background: #121212;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  width: 360px;
  max-width: 100%;
}

.rooms-table {
  background: #1b1b1f;
}

.rooms-table :deep(thead tr th) {
  font-weight: 700;
  color: #cbd5f5;
  background: #1b1b1f;
}

.match-name {
  font-weight: 600;
}

.score-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-weight: 700;
}

.score-team {
  display: flex;
  align-items: center;
  gap: 6px;
}

.team-mini {
  color: #cbd5f5;
}

.team-score {
  font-size: 18px;
}

.score-separator {
  color: #8b8b95;
}
</style>
