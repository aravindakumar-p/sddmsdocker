<template>
	<div class="d-flex">
		<v-button class="m-2" :rounded="rounded" warning large @click.stop="() => handleClick()">
			{{ t('upload_pending') }}
		</v-button>
		<v-button kind="success" :rounded="rounded" warning large @click.stop="() => handleClick('request')">
			{{ t('make_request') }}
		</v-button>
	</div>
	<v-dialog :model-value="activeDialog" @esc="activeDialog = false" @update:model-value="activeDialog = false">
		<v-card>
			<v-card-title>{{ t('confirm_pending_serial') }}</v-card-title>
			<v-card-text>
				<div class="field full">
					<v-input clickable>
						<template #prepend>
							<div class="preview" :class="{ 'has-file': file }"></div>
						</template>
						<template #input>
							<input
								id="import-file"
								ref="fileInput"
								type="file"
								accept="csv"
								hidden
								@change="(event) => onChange(event)"
							/>
							<label for="import-file" class="import-file-label"></label>
							<span class="import-file-text" :class="{ 'no-file': !file }">
								{{ file ? file.name : 'CSV...' }}
							</span>
						</template>
						<template #append>
							<template v-if="file">
								<v-icon v-tooltip="'DeSelect'" class="deselect" name="close" @click.stop="clearFileInput" />
							</template>
							<v-icon v-else name="attach_file" />
						</template>
					</v-input>
				</div>
				<div class="field full">
					<button class="download-local info" @click="() => downloadCSV()">{{ t('download_sample') }}</button>
				</div>
				<div v-if="fileFormat" class="field full v-notice danger">{{ error }}</div>
			</v-card-text>
			<v-card-actions>
				<v-button secondary @click="activeDialog = false">{{ t('cancel') }}</v-button>
				<v-button :disabled="!file" success @click.stop="() => triggerFlow()">{{ t('make_request') }}</v-button>
			</v-card-actions>
		</v-card>
	</v-dialog>
	<v-dialog :model-value="!!confirmRunFlow" @esc="resetConfirm">
		<v-card>
			<template v-if="confirmDetails">
				<v-card-title>{{ confirmDetails.description ?? t('run_flow_confirm') }}</v-card-title>

				<v-card-text class="confirm-form">
					<v-form
						v-if="confirmDetails.fields && confirmDetails.fields.length > 0"
						:fields="confirmDetails.fields"
						:model-value="confirmValues"
						autofocus
						primary-key="+"
						@update:model-value="confirmValues = $event"
					/>
				</v-card-text>
			</template>

			<template v-else>
				<v-card-title>{{ t('unsaved_changes') }}</v-card-title>
				<v-card-text>{{ t('run_flow_on_current_edited_confirm') }}</v-card-text>
			</template>

			<v-card-actions>
				<v-button secondary @click="resetConfirm">
					{{ t('cancel') }}
				</v-button>
				<v-button :disabled="isConfirmButtonDisabled" @click="runManualFlow()">
					{{ confirmButtonCTA }}
				</v-button>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, unref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();

interface Props {
	collection: string;
	isEnable: boolean;
	value?: (number | string | Record<string, any>)[] | Record<string, any>;
	primaryKey: string | number;
	field: string;
	flowid: string;
	confirm: string;
}

const props = withDefaults(defineProps<Props>(), {
	collection: '',
	isEnable: false,
	primaryKey: '',
	value: '',
	field: '',
	flowid: '',
	confirm: '',
});
const codes = ref([]);
const api = useApi();
const error = ref('');
const router = useRouter();
const flows: any = ref(null);
const confirmButtonCTA = computed(() => {
	return props.confirm;
});
onMounted(async () => {
	const shakepeCodes = await api.get(`/items/${props.collection}/${props.primaryKey}`, {
		params: {
			fields: ['shakepe_codes.serial_number', 'shakepe_codes.id'],
		},
	});
	const response = await api.get(`/flows/${props.flowid}`, { params: { limit: -1, fields: ['*', 'operations.*'] } });
	flows.value = response.data.data;
	codes.value = shakepeCodes.data?.data?.shakepe_codes;
});
const fileFormat = ref(false);
const triggerData = ref([]);
const confirmRunFlow = ref<any>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const activeDialog = ref(false);
const file = ref<File | null>(null);
const handleClick = (value?: any) => {
	if (!value) {
		activeDialog.value = !activeDialog.value;
	} else {
		if (!flows.value) return;
		if (flows.value.options?.requireConfirmation) {
			confirmRunFlow.value = props.flowid;
		}
	}
};
const resetConfirm = () => {
	confirmRunFlow.value = null;
};
function clearFileInput() {
	if (fileInput.value) fileInput.value.value = '';
	file.value = null;
}

function onChange(event: Event) {
	try {
		const files: any = (event?.target as HTMLInputElement)?.files;
		if (files && files.length > 0 && files[0].type == 'text/csv') {
			const reader = new FileReader();
			reader.readAsText(files[0]);
			reader.onload = async () => {
				const text = reader.result.toString();
				const csvData: any = csvJSON(text);
				try {
					const checked = checkingData(csvData, codes.value);
					fileFormat.value = false;
					error.value = '';
					file.value = files.item(0);
					triggerData.value = checked;
				} catch (err) {
					fileFormat.value = true;
					error.value = err?.error ?? err;
					clearFileInput();
				}
			};
		} else {
			error.value = t('invaild_file');
			fileFormat.value = true;
			clearFileInput();
		}
	} catch (err) {
		error.value = t('invaild_file');
		clearFileInput();
		fileFormat.value = true;
	}
}

const triggerFlow = async () => {
	return await runManualFlow(triggerData.value);
};
const confirmDetails = computed(() => {
	if (!unref(confirmRunFlow)) return null;
	if (!flows.value) return null;

	if (!flows.value.options?.requireConfirmation) return null;

	return {
		description: flows.value.options.confirmationDescription,
		fields: (flows.value.options.fields ?? []).map((field: Record<string, any>) => ({
			...field,
			name: !field.name && field.field ? field.field : field.name,
		})),
	};
});
function csvJSON(csvText: any) {
	let lines: any = [];
	const linesArray = csvText.split('\n');
	// for trimming and deleting extra space
	linesArray.forEach((e: any) => {
		const row = e.replace(/[\s]+[,]+|[,]+[\s]+/g, ',').trim();
		lines.push(row);
	});
	// for removing empty record
	lines.splice(lines.length - 1, 1);

	const headers = lines[0].split(',');

	const result = lines.slice(1).map((line) => {
		const currentLine = line.split(',');
		return headers.reduce((obj: any, header: any, index: any) => {
			obj[header] = currentLine[index];
			return obj;
		}, {});
	});

	return result;
}

const downloadCSV = () => {
	const data = [{ serial_number: 1 }, { serial_number: 2 }, { serial_number: 3 }];
	const csv = convertToCSV(data);
	const blob = new Blob([csv], { type: 'text/csv' });
	const link = document.createElement('a');
	link.href = window.URL.createObjectURL(blob);
	link.download = 'sample.csv';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};
const convertToCSV = (arr: any) => {
	const header = Object.keys(arr[0]).join(',') + '\n';
	const body = arr
		.map((obj: any) =>
			Object.values(obj)
				.map((value) => (typeof value === 'number' ? value : `"${value}"`))
				.join(',')
		)
		.join('\n');
	return header + body;
};

const checkingData = (csvData: any, databaseData: any) => {
	const notMatched = [];
	csvData.forEach((csvItem: any) => {
		const serialNumber = parseInt(csvItem?.serial_number);
		const numberRegex = new RegExp(/^(?!.*E).*[0-9].*$/);
		const verifyOfString = /^-?\d*\.?\d+$/.test(csvItem?.serial_number) && !isNaN(parseInt(csvItem?.serial_number));
		if (csvItem?.serial_number && typeof serialNumber == 'number' && verifyOfString) {
			const existingItem: any = databaseData.find((item: any) => item.serial_number === csvItem.serial_number);
			if (existingItem) {
				csvItem.id = existingItem.id;
			} else {
				notMatched.push(csvItem);
			}
		} else {
			throw {
				error: t('invaild_file'),
			};
		}
		return notMatched;
	});
	if (notMatched.length > 0) {
		throw {
			error: ` ${notMatched.length} ${t('not_exiting_csv_data')}`,
		};
	} else {
		return csvData.map((csvItem: any) => {
			const existingItem: any = databaseData.find((item: any) => item.serial_number === csvItem.serial_number);
			return existingItem;
		});
	}
};

const runManualFlow = (checkedData: any) => {
	api
		.post(`/flows/trigger/${props.flowid}`, {
			collection: props.collection,
			keys: [props.primaryKey],
			data: checkedData,
		})
		.then(() => {
			try {
				router.push(`/content/${props.collection}`);
			} catch (error) {}
		});
};
</script>

<style lang="scss" scoped>
.danger {
	color: var(--danger);
}
.m-2 {
	margin-right: 2rem;
}
.d-flex {
	display: flex;
}
.fields,
.export-fields {
	.v-divider {
		grid-column: 1 / span 2;
	}
}

.fields {
	--form-vertical-gap: 24px;

	.type-label {
		font-size: 1rem;
	}
}

.export-fields {
	--folder-picker-background-color: var(--background-subdued);
	--folder-picker-color: var(--background-normal);

	margin-top: 24px;
	padding: var(--content-padding);
}

.v-checkbox {
	width: 100%;
	margin-top: 8px;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.uploading {
	--v-progress-linear-color: var(--white);
	--v-progress-linear-background-color: rgb(255 255 255 / 0.25);

	display: flex;
	flex-direction: column;
	justify-content: center;
	height: var(--input-height);
	padding: var(--input-padding);
	padding-top: 0px;
	padding-bottom: 0px;
	color: var(--white);
	background-color: var(--primary);
	border: var(--border-width) solid var(--primary);
	border-radius: var(--border-radius);

	.type-text {
		display: flex;
		justify-content: space-between;
		margin-bottom: 4px;
		color: var(--white);
	}

	.v-progress-linear {
		margin-bottom: 4px;
	}
}

.preview {
	--v-icon-color: var(--foreground-subdued);

	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	margin-left: -8px;
	overflow: hidden;
	background-color: var(--background-normal);
	border-radius: var(--border-radius);

	&.has-file {
		background-color: var(--primary-alt);
	}
}

.extension {
	color: var(--primary);
	font-weight: 600;
	font-size: 11px;
	text-transform: uppercase;
}

.import-file-label {
	position: absolute;
	top: 0;
	left: 0;
	display: block;
	width: 100%;
	height: 100%;
	cursor: pointer;
	opacity: 0;
	appearance: none;
}

.import-file-text {
	flex-grow: 1;
	overflow: hidden;
	line-height: normal;
	white-space: nowrap;
	text-overflow: ellipsis;

	&.no-file {
		color: var(--foreground-subdued);
	}
}

:deep(.v-button) .button:disabled {
	--v-button-background-color-disabled: var(--background-normal-alt);
}

.download-local {
	color: var(--foreground-subdued);
	text-align: right;
	display: block;
	width: 100%;
	margin-top: 8px;
	transition: color var(--fast) var(--transition);
	color: var(--primary);

	&:hover {
		color: var(--primary);
	}
}
</style>
