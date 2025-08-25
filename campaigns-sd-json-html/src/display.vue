<template>
  <div v-if="tempHtmlString.length" v-html="tempHtmlString" />
  <div v-else>{{ value }}</div>
</template>

<script lang="ts" setup>
import { defineProps } from 'vue';

const props = defineProps({
  value: {
    type: String,
    default: "{}"
  },
  html_str: {
    type: String,
    default: ""
  }
});

const getAllInternalValues = (str) => {
  const valuesWithCurlyBraces = str.match(/{{([^}]+)}}/g);
  const finalValues = valuesWithCurlyBraces.map(value=>{
    let fVal = value.split("{{").join("").split("}}").join("");
    return fVal.trim();
  });
  return finalValues;
};

const parsedJson = JSON.parse(props.value);
const allInternalValues = getAllInternalValues(props.html_str);

let tempHtmlString = props.html_str? props.html_str: "";

allInternalValues.forEach(key=>{
  const val = parsedJson[key];
  tempHtmlString = tempHtmlString?.split(key).join(val);
});

tempHtmlString = tempHtmlString.split("{{").join("").split("}}").join("");

</script>
