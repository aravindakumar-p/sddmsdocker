import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'custom-button',
	name: 'SD ShakePe',
	icon: 'box',
	description: 'Display for ShakePe Order',
	component: DisplayComponent,
	options: (data) => {
		const fields = [
			{
				field: 'backbutton',
				name: 'Back Button',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'boolean',
					options: {
						label: 'Enable of Back Button',
					},
				},
				schema: {
					default_value: false,
				},
			},
			{
				field: 'rounded',
				name: 'Rounded Button',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'boolean',
					options: {
						label: 'Rounded Button',
					},
				},
				schema: {
					default_value: false,
				},
			},
			{
				field: 'background',
				name: 'Background',
				type: 'string',
				meta: {
					interface: 'select-color',
					width: 'half',
				},
			},
			{
				field: 'iconElement',
				name: 'Icon CSS',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'input',
				},
			},
			{
				field: 'firstChildElement',
				name: 'First Child CSS',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'input',
				},
			},
			{
				field: 'secondChildElement',
				name: 'Second Child CSS',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'input',
				},
			},
			{
				field: 'thirdChildElement',
				name: 'Third Child CSS',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'input',
				},
			},
		];

		return fields;
	},
	types: ['string'],
});
