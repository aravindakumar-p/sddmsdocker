import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-custom-button',
	name: 'Custom Button Flow',
	description: '$t:interfaces.presentation-links.description',
	icon: 'smart_button',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
	options: ({ field, collection }) => {
		
		const defaultOptions = [
			{
				field: 'label',
				type: 'string',
				name: '$t:label',
				meta: {
					width: 'full',
					interface: 'system-input-translated-string',
					options: {
						placeholder: '$t:label',
					},
				},
			},
			{
				field: 'icon',
				name: '$t:icon',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-icon',
				},
			},
			{
				field: 'types',
				name: '$t:type',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-dropdown',
					default_value: 'normal',
					options: {
						choices: [
							{ text: '$t:primary', value: 'primary' },
							{ text: '$t:normal', value: 'normal' },
							{ text: '$t:info', value: 'info' },
							{ text: '$t:success', value: 'success' },
							{ text: '$t:warning', value: 'warning' },
							{ text: '$t:danger', value: 'danger' },
						],
					},
				},
				schema: {
					default_value: 'normal',
				},
			},
			{
				field: 'flow',
				type: 'string',
				name: '$t:flows',
				meta: {
					interface: 'sd-system-flows',
					options: {
						includeSystem: true,
						includeSingleton: false,
					},
					width: 'full',
				},
				schema: {
					default_value: null,
				},
			},
		];
		return defaultOptions;
	},
});
