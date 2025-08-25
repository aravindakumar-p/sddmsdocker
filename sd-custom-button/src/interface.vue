<template>
	<div class="presentation-links">
		<v-button class="action" :class="types" :loading="runningFlows.includes(flow)" @click="() => onFlowClick()">
			<v-icon v-if="icon" left :name="icon" />
			<span v-if="label">{{ label }}</span>
		</v-button>
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
					<v-button :disabled="isConfirmButtonDisabled" @click="runManualFlow(confirmRunFlow!)">
						{{ confirmButtonCTA }}
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>
<script setup lang="ts">
import { useApi, useItems, useStores } from '@directus/extensions-sdk';
import { onMounted, toRefs, unref, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
const { t } = useI18n();
const api = useApi();

const props = withDefaults(
	defineProps<{
		value?: (number | string | Record<string, any>)[] | Record<string, any>;
		primaryKey: string | number;
		collection: string;
		field: string;
		label: string;
		icon: string;
		types: string;
		disabled?: boolean;
		enableCreate?: boolean;
		enableSelect?: boolean;
		limit?: number;
		flow: number | string;
		allowDuplicates?: boolean;
	}>(),
	{
		value: undefined,
		disabled: false,
		label: '',
		icon: '',
		types: '',
		flow: '',
		enableCreate: true,
		enableSelect: true,
		limit: 15,
		allowDuplicates: false,
	}
);
const { collection, primaryKey } = toRefs(props);
const flows = ref<any>(null);
const router = useRouter();
const emit = defineEmits(['refresh']);
const { useNotificationsStore } = useStores();
let store;
const notify = (notification: any) => {
	if (!store) store = useNotificationsStore();
	store.add(notification);
};

onMounted(async () => {
	try {
		const dialog = document.getElementById('dialog-outlet');
		const response = await api.get(`/flows/${props.flow}`, { params: { limit: -1, fields: ['*', 'operations.*'] } });
		flows.value = response.data.data;
		if (dialog) {
			try {
				const elementsToHide = dialog.querySelectorAll('.v-text-overflow');
				elementsToHide.forEach((element: any) => {
					if (element.textContent == 'Client') {
						element.style.display = 'none';
						const parentElement = element.closest('.field.full');
						if (parentElement) {
							parentElement.style.display = 'none';
						}
					}
				});
			} catch (error) {}
		}
	} catch (error) {}
});

const confirmValues = ref<any>();
const confirmRunFlow = ref<any>(null);
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
const confirmButtonCTA = computed(() => {
	return 'Submit';
});
const isConfirmButtonDisabled = computed(() => {
	if (!confirmRunFlow.value) return true;

	for (const field of confirmDetails.value?.fields || []) {
		if (
			field.meta?.required &&
			(!confirmValues.value ||
				confirmValues.value[field.field] === null ||
				confirmValues.value[field.field] === undefined)
		) {
			return true;
		}
	}
	return false;
});
const onFlowClick = async () => {
	if (!flows.value) return;
	if (flows.value.options?.requireConfirmation) {
		confirmRunFlow.value = props.flow;
	} else {
		runManualFlow(props.flow);
	}
};

const resetConfirm = () => {
	confirmRunFlow.value = null;
	confirmValues.value = null;
};

const runningFlows = ref<string[]>([]);

const runManualFlow = (flowId: string | number) => {
	runningFlows.value = [...runningFlows.value, flowId];
	api
		.post(`/flows/trigger/${flowId}`, {
			...(unref(confirmValues) ?? {}),
			collection: props.collection,
			keys: [props.primaryKey],
		})
		.then((data: any) => {
			try {
				runningFlows.value = [];

				if (data.data.errorMessage) {
					notify({
						type: data.data?.type,
						title: data.data?.message,
					});
				}
				if (data?.data?.download) {
					downloadFile(data, api?.defaults?.headers?.common['Authorization']?.split(' ')[1] || null);
				} else {
					router.push(`/content/${router.currentRoute.value.params?.collection}`);
				}
			} catch (error) {}
		});
};

const downloadFile = (response: any, token: string) => {
	if (response.data.download) {
		if (response.data.type == 'previousnode') {
			const tablesData = response.data.tablesData[0].result;

			// Create a CSV formatted string
			const csvContent =
				'data:text/csv;charset=utf-8,' +
				encodeURIComponent(
					tablesData
						.map((table) => {
							// Extract table data
							const { tableName, headers, contentData } = table;
							// Format table headers and content as CSV rows
							let tableContent = '';
							if (tableName) {
								tableContent = [`${tableName}`]
									.concat([headers.join(',')].concat(contentData.map((row) => row.join(','))))
									.join('\n');
							} else {
								tableContent = [headers.join(',')].concat(contentData.map((row) => row.join(','))).join('\n');
							}
							return tableContent;
						})
						.join('\n\n') // Add a blank line between tables
				);

			// Create a download link
			const downloadLink = document.createElement('a');
			downloadLink.href = csvContent;
			downloadLink.download = response.data.fileName;
			document.body.appendChild(downloadLink);

			// Initiate the download
			downloadLink.click();

			// Clean up
			document.body.removeChild(downloadLink);
		} else if (response.data.type == 'static') {
			const token = api?.defaults?.headers?.common['Authorization']?.split(' ')[1] || null;
			let params: Record<string, unknown> = {
				access_token: token,
			};
			if (response.data.query && response.data.query.fields) {
				params.fields = response.data.query.fields;
			}
			if (response.data.query && response.data.query.filter) {
				params.filter = response.data.query.filter;
			}
			let url = '';
			if (response.data.tab !== 'sametab') {
				url = response.data.url;
			} else if (response.data.tab === 'sametab') {
				router.push(`/${response.data.url}`);
			} else {
				params.export = 'csv';
				params.limit = -1;
				url = 'items/' + response.data.collection;
			}
			const exportUrl = api.getUri({
				url,
				params,
			});
			if ((response.data.recordExist || response.data.type == 'static') && response.data.tab !== 'sametab') {
				window.open(exportUrl);
			}
		}
	}
	if (response.data.errorMessage) {
		notify({
			type: data.data?.type,
			title: data.data?.message,
		});
	}
};
</script>
