<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar class="bg-blue-grey-10 text-white">
        <q-btn flat to="/" style="font-size: 16pt">
          <q-img src="/MR-logo.png" style="width: 110px; height: 40px" />
        </q-btn>

        <q-btn stretch flat label="Team" @click="navigate('/team')" v-if="isViewMode === '9004'"/>

        <q-btn stretch flat label="Matches" @click="navigate('/matches')" v-if="isViewMode === '9004'"/>

        <q-btn stretch flat label="Room" @click="navigate('/room')" v-if="isViewMode === '9004'"/>

        <q-btn stretch flat label="Draft" @click="navigate('/live/draft')" v-if="isViewMode === '9004' || isViewMode === '9007'"/>

        <!-- <q-btn stretch flat label="Live" @click="navigate('/live/dashboard')" v-if="isViewMode === '9004' || isViewMode === '9007'"/> -->

        <q-btn stretch flat label="Test" @click="navigate('/test/draft')" v-if="isViewMode === '9004'"/>

      </q-toolbar>
    </q-header>

    <!-- Page Container Section -->
    <q-page-container class="bg-dark">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { useRouter } from 'vue-router'

const isViewMode = window.location.port
const router = useRouter()

function navigate(path) {
  router.push(path)
}

</script>
<style scoped>
:global(.q-loading-bar) {
  display: none !important;
}
</style>
