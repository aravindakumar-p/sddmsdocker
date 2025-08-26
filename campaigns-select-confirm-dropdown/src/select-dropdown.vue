<template>
	<v-notice v-if="!choices" type="warning">
		{{ t('choices_option_configured_incorrectly') }}
	</v-notice>
	<v-select
		v-else
		:model-value="valueRef"
		:items="choices"
		:disabled="disabled"
		:show-deselect="allowNone"
		:placeholder="placeholder"
		:allow-other="allowOther"
		@update:model-value="(value)=>{onValueChanged(value); }"
	>
		<template v-if="icon" #prepend>
			<v-icon :name="icon" />
		</template>
	</v-select>
  <v-dialog v-model="showDialogRef" @esc="noCloseDialog">
    <v-card>
      <v-card-text><div v-html="dialogMessageRef"></div></v-card-text>
      <v-card-actions>
        <v-button v-if="noButtonText" secondary @click="noCloseDialog">
          {{ noButtonText }}
        </v-button>
        <v-button v-if="yesButtonText" @click="yesCloseDialog">{{ yesButtonText }}</v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { defineComponent, PropType, defineProps, defineEmits, ref, watch } from 'vue';

const showDialogRef = ref(false);
const dialogMessageRef = ref("");
const valueRef = ref("");


type Option = {
	text: string;
  confirmMessage: string;
	value: string | number | boolean;
	children?: Option[];
};

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  value: {
    type: [String, Number],
    default: null,
  },
  choices: {
    type: Array as PropType<Option[]>,
    default: null,
  },
  icon: {
    type: String,
    default: null,
  },
  allowNone: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: null,
  },
  yesButtonText: {
    type: String,
    default: null,
  },
  noButtonText: {
    type: String,
    default: null,
  },
  allowOther: {
    type: Boolean,
    default: false,
  },
});


const emit = defineEmits(['input']);
const initialValue = props.value;
valueRef.value = props.value;
const onValueChanged = (value) => {
  try {
    for (let i = 0; i < props.choices.length; i++) {
      const choiceDetails = props.choices[i];

      if (choiceDetails['confirmMessage'] && choiceDetails['confirmMessage'].trim().length) {
        if (value==choiceDetails['value']) {
          dialogMessageRef.value = choiceDetails['confirmMessage'].trim();
          showDialogRef.value = true;
        }
      }
    }
    valueRef.value = value;
    // emit('input', value);
  } catch (e) {
    console.log(e)
  }

}

const noCloseDialog = ()=>{
  valueRef.value = initialValue;
  emit('input', initialValue);
  showDialogRef.value = false;
}

const yesCloseDialog = ()=>{
  emit('input', valueRef.value);
  showDialogRef.value = false;
}


</script>
