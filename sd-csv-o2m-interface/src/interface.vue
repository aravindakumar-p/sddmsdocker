<template>
	<template v-if="filename">
		<v-list-item clickable :download="filename.filename_download" :href="getAssetUrl(filename.id, true)">
			<v-list-item-icon><v-icon name="get_app" /></v-list-item-icon>
			<v-list-item-content>{{ t('download_file') }}</v-list-item-content>
		</v-list-item>
		<v-divider v-if="!disabled" />
	</template>
	<div class="d-flex" v-else>
		<v-button class="m-2" :rounded="rounded" warning large @click.stop="() => handleClick()">
			{{ t('upload_csv') }}
		</v-button>
	</div>
	<v-dialog :model-value="activeDialog" @esc="() => cancel()" @update:model-value="() => cancel()">
		<v-card>
			<v-card-title>{{ t('upload_csv_file') }}</v-card-title>
			<v-card-text>
				<div class="field full">
					<v-input clickable>
						<template #prepend>
							<div class="preview" :class="{ 'has-file': file }"></div>
						</template>
						<template #input>
							<input id="import-file" ref="fileInput" type="file" accept="csv" hidden
								@change="(event: any) => onChange(event)" />
							<label for="import-file" class="import-file-label"></label>
							<span class="import-file-text" :class="{ 'no-file': !file }">
								{{ file ? file.name : 'CSV...' }}
							</span>
						</template>
						<template #append>
							<template v-if="file">
								<v-icon v-tooltip="'DeSelect'" class="deselect" name="close"
									@click.stop="clearFileInput" />
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
				<v-button secondary @click="() => cancel()">{{ t('cancel') }}</v-button>
				<v-button :disabled="!file" success @click.stop="() => onUpload()">{{ t('upload') }}</v-button>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, computed, toRefs, inject, onMounted, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';

type FileInfo = {
	id: string;
	title: string;
	type: string;
};
const api = useApi();

const props = withDefaults(
	defineProps<{
		value?: string | Record<string, any> | null;
		disabled?: boolean;
		folder?: string;
		collection: string;
		field: string;
	}>(),
	{
		value: () => null,
		disabled: false,
		folder: undefined,
	}
);
const values = inject('values');

const emit = defineEmits(['input', 'setFieldValue']);

const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);

const value = computed({
	get: () => props.value ?? null,
	set: (value) => {
		emit('input', value);
	},
});

const filename = ref(null);

onMounted(async () => {
	if (props.value) {
		try {
			const data = await api.get(`files/${props.value}`, {
				params: {
					fields: ['id', 'title', 'type', 'filename_download']
				}
			})
			filename.value = data.data.data

		} catch (error) {
		}

	}

})
const { t } = useI18n();

const activeDialog = ref(false);

const assetURL = computed(() => {
	const id = typeof props.value === 'string' ? props.value : props.value?.id;
	return '/assets/' + id;
});

const fileFormat = ref(false);
const error = ref('');

function clearFileInput() {
	if (fileInput.value) fileInput.value.value = '';
	file.value = null;
}

const downloadCSV = () => {
	const data = [{ serial_number: 1, denomination: 10 }];
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
const finalData: any = ref(null);
const serialNumber: any = ref(null);
const csvData: any = ref(null);
async function onChange(event: Event) {
	try {
		const files: any = (event?.target as HTMLInputElement)?.files;
		if (files && files.length > 0 && files[0].type == 'text/csv') {
			const reader = new FileReader();
			reader.readAsText(files[0]);
			reader.onload = async () => {
				const text = reader.result.toString();
				csvData.value = csvJSON(text);
				try {
					if (csvData.value.length > 0) {
						csvData.value.forEach((item: any) => {
							if (!('serial_number' in item) || item['serial_number'] == null || item['serial_number'] == '') {
								fileFormat.value = true;

								throw {
									error: t('empty_serial_number'),
								};
							} else if (item['serial_number'] < 0) {
								fileFormat.value = true;

								throw {
									error: t('serial_number_not_negtive'),
								};
							} else if (isNaN(item['serial_number'])) {
								fileFormat.value = true;

								throw {
									error: t('serial_number_should_be_number'),
								};
							} else if (!('denomination' in item) || item['denomination'] == null || item['denomination'] == '') {
								fileFormat.value = true;

								throw {
									error: t('empty_denomination'),
								};
							} else if (isNaN(item['denomination'])) {
								fileFormat.value = true;

								throw {
									error: t('denomination_should_be_number'),
								};
							} else if (item['denomination'] < 0) {
								fileFormat.value = true;

								throw {
									error: t('not_negtive_denomination'),
								};
							}
						});
						serialNumber.value = csvData.value
							.map((data: any) => {
								return data?.serial_number.trim();
							})
							.filter((serialNumber: any) => {
								return serialNumber != null || serialNumber != '';
							});
						const serialNumbers = serialNumber.value;
						const chunkSize = 20;
						const serialNumberChunks = chunkArray(serialNumber.value, chunkSize);

						const apiPromises = serialNumberChunks.map(async (chunk) => {
							try {
								const response = await api.get('/items/shakepe_codes_inventory', {
									params: {
										filter: {
											_and: [
												{
													serial_number: {
														_in: chunk,
													},
												},
												{
													creation_id: {
														client: {
															id: {
																_eq: values?.value?.product_type,
															},
														},
													},
												},
												{
													status: {
														_eq: 'Available',
													},
												},
											],
										},
										fields: ['serial_number'],
									},
								});
								return response;
							} catch (error) {
							}
						});

						const responses = await Promise.all(apiPromises);

						const findingExistingData = responses.map((api) => {
							return api.data.data
						}).flat(1)

						fileFormat.value = false;
						if (findingExistingData?.length == serialNumber.value?.length) {
							const uniqueDenominations = csvData.value.reduce((acc: any, { denomination }) => {
								acc[denomination] = (acc[denomination] || 0) + 1;
								return acc;
							}, {});

							finalData.value = Object.entries(uniqueDenominations).map(([deno, total_serial]) => ({
								total_no_of_codes: total_serial,
								value_of_code: parseInt(deno),
								activation: new Date(values?.value?.activation_date),
								validity: addingValidDate(values?.value?.activation_date, values?.value?.validity_of_code),
							}));

							emit('setFieldValue', {
								field: 'shakepe_codes_orders',
								value: {
									create: finalData.value,
									update: [],
									delete: [],
								},
							});
							return (file.value = files[0]);
						} else {
							fileFormat.value = true;
							throw {
								error: t('serial_number_doesnot_exit'),
							};
						}
					} else {
					}
				} catch (err: any) {
					clearFileInput();

					error.value = err.error;
				}
			};
		} else {
			error.value = t('invaild_file');
			clearFileInput();
		}
	} catch (err) {
		error.value = t('invaild_file');
		clearFileInput();
	}
}
function addingValidDate(date: any, month: any) {
	const newDate = new Date(date);
	const currentMonth = newDate.getMonth();
	newDate.setMonth(currentMonth + month);

	// Handling cases where the new month might have fewer days
	const currentDay = newDate.getDate();
	const maxDayInNewMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
	newDate.setDate(Math.min(currentDay, maxDayInNewMonth));

	return newDate;
}
async function onUpload() {
	emit('setFieldValue', {
		field: 'file_upload_data',
		value: csvData.value,
	});
	const formData = new FormData();
	formData.append('file', file.value);

	const uploadedFile: any = await api.post(`/files`, formData);
	activeDialog.value = false;
	filename.value = uploadedFile.data.data;

	value.value = uploadedFile.data.data.id;
}

const handleClick = () => {
	activeDialog.value = !activeDialog.value;
};

const cancel = () => {
	activeDialog.value = false;
	emit('setFieldValue', {
		field: 'shakepe_codes_orders',
		value: {
			create: [],
			update: [],
			delete: [],
		},
	});
	filename.value = null;
	value.value = null;
	fileFormat.value = false;
	error.value = '';
	file.value = null;
};

function csvJSON(csvText: any) {
	try {
		let lines: any = [];
		const linesArray = csvText.split('\n');
		// for trimming and deleting extra space
		linesArray.forEach((e: any) => {
			const row = e.replace(/[\s]+[,]+|[,]+[\s]+/g, ',').trim();
			lines.push(row);
		});

		const headers = lines[0].split(',');
		lines = lines.filter((item: any) => {
			return item !== '' && item != ',';
		});
		const result = lines.slice(1).map((line: any) => {
			const currentLine = line.split(',');
			return headers.reduce((obj: any, header: any, index: any) => {
				obj[header] = currentLine[index];
				return obj;
			}, {});
		});

		return result;
	} catch (error) { }
}

function chunkArray(array: any, chunkSize: any) {
	return array.reduce((resultArray, item, index) => {
		const chunkIndex = Math.floor(index / chunkSize);

		if (!resultArray[chunkIndex]) {
			resultArray[chunkIndex] = []; // start a new chunk
		}

		resultArray[chunkIndex].push(item);

		return resultArray;
	}, []);
}
watch(
	() => values?.value?.form_factor,
	() => {
		if (values?.value?.form_factor == "Virtual") {

			setTimeout(() => {
				emit('setFieldValue', {
					field: 'shakepe_codes_orders',
					value: {
						create: [],
						update: [],
						delete: [],
					},
				});

			}, 2000);


			setTimeout(() => {
				emit('setFieldValue', {
				field: 'activation_date',
				value: null

			});

			}, 3000);


			
			value.value = null;
		}
	}
);
function getAssetUrl(filename: string, isDownload?: boolean): string {
	const assetUrl = new URL(`assets/${filename}`, getPublicURL());

	if (isDownload) {
		assetUrl.searchParams.set('download', '');
	}
	console.log(addTokenToURL(assetUrl.href))
	return addTokenToURL(assetUrl.href);
}

function getPublicURL(): string {
	return extract(window.location.href);
}
function addTokenToURL(url: string, token?: string): string {
	const accessToken = token || api?.defaults?.headers?.common['Authorization']?.split(' ')[1] || null;
	if (!accessToken) return url;

	return addQueryToPath(url, { access_token: accessToken });
}


function extract(path: string) {
	const parts = path.split('/');
	const adminIndex = parts.indexOf('admin');
	const rootPath = parts.slice(0, adminIndex).join('/') + '/';
	return rootPath;
}

function addQueryToPath(path: string, query: Record<string, string>): string {
	const queryParams = new URLSearchParams(path.split('?')[1] || '');

	for (const [key, value] of Object.entries(query)) {
		queryParams.set(key, value);
	}

	return path.split('?')[0] + '?' + queryParams;
}
</script>

<style lang="scss" scoped>
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

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	&.has-file {
		background-color: var(--primary-alt);
	}

	&.is-svg {
		padding: 4px;
		background-color: var(--background-normal-alt);

		img {
			object-fit: contain;
			filter: drop-shadow(0px 0px 8px rgb(0 0 0 / 0.25));
		}
	}
}

.extension {
	color: var(--primary);
	font-weight: 600;
	font-size: 11px;
	text-transform: uppercase;
}

.deselect:hover {
	--v-icon-color: var(--danger);
}

.edit {
	margin-right: 4px;

	&:hover {
		--v-icon-color: var(--foreground-normal);
	}
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
</style>
