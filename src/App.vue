<script setup>
// Two layout variants. Switch the import below to compare:
//   Dashboard       -> Claude & Codex stacked full-width (alternative)
//   DashboardSplit  -> Claude & Codex side by side, 50% each (active)
import DashboardSplit from './DashboardSplit.vue'
// import Dashboard from './Dashboard.vue'
</script>

<template>
  <DashboardSplit />
  <!-- <Dashboard /> -->
</template>

<style scoped></style>
