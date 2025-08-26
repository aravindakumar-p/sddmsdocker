import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-qr-interface',
	name: 'SD QR Interface',
	icon: 'box',
	description: 'To Show QR on Forms',
	component: InterfaceComponent,
    options: [
        {
            field: 'size',
            name: 'QR Size',
            type: 'number',
            meta: {
                width: 'full',
                interface: 'input-text'
            }
        },
        {
            field: 'fontSize',
            name: 'Font Size',
            type: 'number',
            meta: {
                width: 'full',
                interface: 'input-text'
            }
        },
        {
            field: 'maxWidthText',
            name: 'Text Max Width',
            type: 'number',
            meta: {
                width: 'full',
                interface: 'input-text'
            }
        },
    ],
	types: ['string'],
});
