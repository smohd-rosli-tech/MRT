<template>
  <q-page class="bg-dark text-white q-pa-md">
    <div class="q-gutter-y-md">
      <div class="text-h5">Teams</div>
      <q-card class="bg-grey-9 text-white">
        <q-card-section>
          <!-- Action Buttons and Search -->
          <div class="row q-gutter-sm justify-between q-pa-md">
            <div>
              <q-btn
                label="Add New Team"
                icon="add"
                color="green-10"
                text-color="white"
                @click="addTeam"
                class="q-mb-sm"
              />
              <q-btn
                label="Refresh Teams"
                icon="refresh"
                color="blue-grey-8"
                text-color="white"
                @click="loadTeams"
                class="q-mb-sm q-ml-sm"
              />
            </div>

            <div class="col-2 float-right q-mr-sm">
              <q-input
                color="grey-4"
                label-color="grey-4"
                dense
                dark
                flat
                v-model="playerFilter"
                @update:model-value="(val) => (playerFilter = val.toLowerCase())"
                label="Search"
                clearable
              >
                <template v-slot:prepend>
                  <q-icon name="search" color="grey-4" />
                </template>
              </q-input>
            </div>
          </div>

          <!-- Teams Grid -->
          <div class="row q-col-gutter-md">
            <div
              v-for="(team, teamIndex) in teams"
              :key="teamIndex"
              class="col-12 col-sm-6 col-md-4 col-lg-3"
            >
              <q-card class="q-pa-md bg-dark text-white shadow-2">
                <!-- Row 1: Team Name & Tag -->
                <div class="row q-col-gutter-sm q-mb-sm">
                  <div class="col-6">
                    <q-input
                      v-model="team.name"
                      label="Team Name"
                      dense
                      filled
                      label-color="grey-4"
                      color="grey-2"
                      dark
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      v-model="team.mini_name"
                      label="Team Tag"
                      dense
                      filled
                      label-color="grey-4"
                      color="grey-2"
                      dark
                    />
                  </div>
                  <div class="col-2">
                    <q-input
                      v-model="team.region"
                      label="Region"
                      dense
                      filled
                      label-color="grey-4"
                      color="grey-2"
                      dark
                    />
                  </div>
                </div>

                <q-separator class="q-my-sm" dark />

                <!-- Players -->
                <div class="text-subtitle2 text-caption q-mb-xs">Players</div>
                <div v-for="(player, pIndex) in team.players" :key="pIndex" class="q-mb-sm">
                  <div class="row q-col-gutter-sm q-mb-sm">
                    <div class="col-8">
                      <q-input
                        v-model="player.name"
                        label="Name"
                        dense
                        filled
                        label-color="grey-4"
                        color="grey-2"
                        dark
                      />
                    </div>
                    <div class="col-4">
                      <q-input
                        v-model="player.uid"
                        label="UID"
                        dense
                        filled
                        label-color="grey-4"
                        color="grey-2"
                        dark
                      />
                    </div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="row justify-end">
                  <q-btn
                    label="DELETE"
                    icon="delete"
                    color="red"
                    flat
                    class="q-mt-sm"
                    @click="confirmDelete(teamIndex)"
                  />
                  <q-btn
                    label="SAVE"
                    icon="save"
                    color="primary"
                    flat
                    class="q-mt-sm"
                    @click="saveTeam(teamIndex)"
                  />
                </div>
              </q-card>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from 'src/boot/axios'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const teams = ref([])

const createNewTeam = () => ({
  _id: null,
  name: '',
  mini_name: '',
  region: '',
  active: false,
  players: Array.from({ length: 6 }, () => ({
    name: '',
    uid: '',
    flag: '',
  })),
})

const addTeam = () => {
  teams.value.unshift(createNewTeam())
  sortTeams()
}

const sortTeams = () => {
  teams.value.sort((a, b) => {
    if (a.active && !b.active) return -1
    if (!a.active && b.active) return 1

    return a.name.localeCompare(b.name)
  })
}

const confirmDelete = (index) => {
  const team = teams.value[index]
  if (!team._id) {
    teams.value.splice(index, 1)
    return
  }

  $q.dialog({
    title: 'Delete Team',
    message: `Are you sure you want to delete "${team.name}"?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await api.delete(`/teams/${encodeURIComponent(team.id)}`)
      teams.value.splice(index, 1)
      $q.notify({ type: 'positive', message: `Team "${team.name}" deleted!` })
    } catch (err) {
      console.error('Delete failed:', err)
      $q.notify({ type: 'negative', message: 'Failed to delete team' })
    }
  })
}

const saveTeam = async (index) => {
  const team = teams.value[index]
  const sanitizedPlayers = team.players.map((p) => ({
    name: typeof p.name === 'string' ? p.name : '',
    uid: p.uid || (typeof p.name === 'object' ? p.name.uid : ''),
    flag: p.flag || 'MY',
  }))

  const cleaned = {
    _id: team._id,
    name: team.name,
    mini_name: team.mini_name,
    region: team.region,
    active: team.active,
    players: sanitizedPlayers,
  }

  try {
    const existing = await checkDuplicate(team._id)
    if (existing) {
      await api.put(`/teams/${encodeURIComponent(team._id)}`, cleaned)
      $q.notify({ type: 'positive', message: `Team "${team.name}" updated!` })
    } else {
      const response = await api.post('/teams', cleaned)
      $q.notify({ type: 'positive', message: `Team "${response.data.name}" saved!` })
    }
    sortTeams()
  } catch (err) {
    console.error('Save failed:', err)
    $q.notify({ type: 'negative', message: 'Failed to save team' })
  }
}

const checkDuplicate = async (id) => {
  if (!id) return false

  try {
    const response = await api.get(`/teams/${encodeURIComponent(id)}`)
    return !!response.data
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return false
    }
    console.error('Error checking duplicate:', err)
    throw err
  }
}

const loadTeams = async () => {
  try {
    const response = await api.get('/teams')
    teams.value = response.data
    sortTeams()
  } catch (err) {
    console.error('Failed to load teams:', err)
    $q.notify({ type: 'negative', message: 'Failed to load teams' })
  }
}

onMounted(loadTeams)
</script>
