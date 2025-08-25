<template>
  <qrcode-vue :value="value" :size="size" level="H" />
<!--  <div class="click" @click="executeFunction">Click</div>-->
</template>

<script lang="ts" setup>
import { defineComponent, defineProps } from 'vue';
import QrcodeVue from 'qrcode.vue'

const props = defineProps({
    value: {
      type: String,
      default: null,
    },
    size: {
      type: Number,
      default: null,
    }
});


const executeFunction = () => {
  console.log("Execute function!!");
}

</script>


<style scoped>
.click {
  height: 20px;
  width: 40px;
  background-color: #cc5c5c;
  cursor: pointer;
  z-index: 1000;
}
</style>