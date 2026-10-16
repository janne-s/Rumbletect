import { createFields } from '../shared/ui/fields.js';
import { PARAMETERS } from '../domain/scene.js';

export const { actionField, checkboxField, numberField, pointFields, seedField, selectField, textField } = createFields(PARAMETERS);
