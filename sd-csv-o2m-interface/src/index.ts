import { defineInterface } from '@directus/shared/utils';
import InterfaceFile from './interface.vue';

export default defineInterface({
	id: 'sd-file-csv-o2m',
	name: '$t:csv-upload:name',
	description: '$t:csv-upload:description',
	icon: 'note_add',
	component: InterfaceFile,
	types: ['uuid'],
	localTypes: ['file'],
	group: 'relational',
	relational: true,
	options: [
		{
			field: 'folder',
			name: '$t:interfaces.system-folder.folder',
			type: 'uuid',
			meta: {
				width: 'full',
				interface: 'system-folder',
				note: '$t:interfaces.system-folder.field_hint',
			},
			schema: {
				default_value: undefined,
			},
		},
	],
	recommendedDisplays: ['file'],
});
