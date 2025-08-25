<template>
  <qrcode-vue :value="value" :size="size" level="H" /><br/>
  <div class="qr-text">{{value}}</div>
</template>

<script lang="ts" setup>
import { defineComponent, defineProps } from 'vue';
import QrcodeVue from 'qrcode.vue'

const props = defineProps({
  value: {
    type: String,
    default: null
  },
  size: {
    type: Number,
    default: null
  },
  fontSize: {
    type: Number,
    default: null
  },
  maxWidthText: {
    type: Number,
    default: null
  }
});


const fontSize = (props.fontSize? props.fontSize:12)+"px";
const maxWidthText = (props.maxWidthText? props.maxWidthText:400)+"px";
</script>

<style>
.qr-text {
  font-size: v-bind(fontSize);
  font-style: italic;
  max-width: v-bind(maxWidthText);
  word-break:break-all;
  user-select: all;
}
</style>