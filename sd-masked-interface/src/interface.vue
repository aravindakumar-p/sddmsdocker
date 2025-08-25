<template>
	<div
		class="v-input"
		:class="{
			'full-width': true,
			'has-click': true,
			disabled: true,
		}"
	>
		<div class="input" :class="{ disabled, active }">
			<input
				v-focus="autofocus"
				v-bind="attributes"
				:placeholder="placeholder ? String(placeholder) : undefined"
				:autocomplete="autocomplete"
				:type="type"
				:min="min"
				:max="max"
				:disabled="disabled"
				:value="modelValue === undefined || modelValue === null ? '' : String(modelValue)"
				v-on="listeners"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
const props = withDefaults(
	defineProps<{
		value: string[];
		frontOffset: number;
		roleid: string;
		backOffset: number;
		autofocus: false;
		disabled: false;
		clickable: false;
		prefix: undefined;
		suffix: undefined;
		fullWidth: true;
		placeholder: undefined;
		nullable: true;
		slug: false;
		slugSeparator: '-';
		type: 'text';
		hideArrows: false;
		max: undefined;
		min: undefined;
		step: 1;
		active: false;
		dbSafe: false;
		trim: false;
		autocomplete: 'off';
		small: false;
	}>(),
	{
		value: () => [],
		roleid: '',
		frontOffset: 0,
		backOffset: 0,
		autofocus: false,
		disabled: false,
		clickable: false,
		prefix: undefined,
		suffix: undefined,
		fullWidth: true,
		placeholder: undefined,
		nullable: true,
		slug: false,
		slugSeparator: '-',
		type: 'text',
		hideArrows: false,
		max: undefined,
		min: undefined,
		step: 1,
		active: false,
		dbSafe: false,
		trim: false,
		autocomplete: 'off',
		small: false,
	}
);

const modelValue = ref(props.value);
const { useUserStore } = useStores();
const userData = useUserStore();
function maskString(str: any, frontOffset: number, backOffset: number) {
	const maskCharacter = 'X';

	if (str.length < parseInt(frontOffset) + parseInt(backOffset)) {
		return str; // Return the string as-is if it's 4 characters or shorter
	} else {
		const maskedMiddle = maskCharacter.repeat(str.length - frontOffset - backOffset);
		const visibleFrontPart = str.substring(0, frontOffset);
		const visibleBackPart = str.substring(str.length - backOffset);

		modelValue.value = visibleFrontPart + maskedMiddle + visibleBackPart;
	}
}
if (props.roleid != userData.currentUser.role.id) {
	maskString(modelValue.value, 3, 3);
}
</script>

<style scoped>
:global(body) {
	--v-input-font-family: var(--family-sans-serif);
	--v-input-placeholder-color: var(--foreground-subdued);
	--v-input-box-shadow-color-focus: var(--primary);
	--v-input-color: var(--foreground-normal);
	--v-input-background-color: var(--background-input);
	--v-input-border-color-focus: var(--primary);
}

.v-input {
	--arrow-color: var(--border-normal);
	--v-icon-color: var(--foreground-subdued);

	display: flex;
	align-items: center;
	width: max-content;
	height: var(--input-height);

	.prepend-outer {
		margin-right: 8px;
	}

	.input {
		position: relative;
		display: flex;
		flex-grow: 1;
		align-items: center;
		height: 100%;
		padding: var(--input-padding);
		padding-top: 0px;
		padding-bottom: 0px;
		color: var(--v-input-color);
		font-family: var(--v-input-font-family);
		background-color: var(--v-input-background-color);
		border: var(--border-width) solid var(--border-normal);
		border-radius: var(--border-radius);
		transition: border-color var(--fast) var(--transition);

		.prepend {
			margin-right: 8px;
		}

		.step-up {
			margin-bottom: -8px;
		}

		.step-down {
			margin-top: -8px;
		}

		.step-up,
		.step-down {
			--v-icon-color: var(--arrow-color);

			display: block;

			&:hover:not(.disabled) {
				--arrow-color: var(--primary);
			}

			&:active:not(.disabled) {
				transform: scale(0.9);
			}

			&.disabled {
				--arrow-color: var(--border-normal);

				cursor: auto;
			}
		}

		&:hover {
			--arrow-color: var(--border-normal-alt);

			color: var(--v-input-color);
			background-color: var(--background-input);
			border-color: var(--border-normal-alt);
		}

		&:focus-within,
		&.active {
			--arrow-color: var(--border-normal-alt);

			color: var(--v-input-color);
			background-color: var(--background-input);
			border-color: var(--v-input-border-color-focus);
			box-shadow: 0 0 16px -8px var(--v-input-box-shadow-color-focus);
		}

		&.disabled {
			--arrow-color: var(--border-normal);

			color: var(--foreground-subdued);
			background-color: var(--background-subdued);
			border-color: var(--border-normal);
		}

		.prefix,
		.suffix {
			color: var(--foreground-subdued);
		}

		.append {
			flex-shrink: 0;
			margin-left: 8px;
		}
	}

	input {
		flex-grow: 1;
		width: 20px; /* allows flex to grow/shrink to allow for slots */
		height: 100%;
		padding: var(--input-padding);
		padding-right: 0px;
		padding-left: 0px;
		font-family: var(--v-input-font-family);
		background-color: transparent;
		border: none;
		appearance: none;

		&::placeholder {
			color: var(--v-input-placeholder-color);
		}

		&::-webkit-outer-spin-button,
		&::-webkit-inner-spin-button {
			margin: 0;
			appearance: none;
		}

		&:focus {
			border-color: var(--v-input-border-color-focus);
		}

		/* Firefox */

		&[type='number'] {
			appearance: textfield;
		}
	}

	&.small {
		height: 38px;

		.input {
			padding: 8px 12px;
		}
	}

	&.full-width {
		width: 100%;

		.input {
			width: 100%;
		}
	}

	&.has-click {
		cursor: pointer;

		&.disabled {
			cursor: auto;
		}

		input {
			pointer-events: none;

			.prefix,
			.suffix {
				color: var(--foreground-subdued);
			}
		}

		.append-outer {
			margin-left: 8px;
		}
	}
}
</style>
