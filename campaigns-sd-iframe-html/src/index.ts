import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-div-html',
	name: 'SD Div HTML',
	icon: 'box',
	description: 'HTML shown inside a Div',
	component: InterfaceComponent,
	options: null,
	types: ['text','string'],
});
