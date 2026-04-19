import { rule as matchingReturnType } from './matching-return-type.rule'
import { rule as matchingResolveFieldParentType } from './matching-resolve-field-parent-type.rule'
import { rule as requireResolveFieldForNestedModels } from './require-resolve-field-for-nested-models.rule'

module.exports = {
  rules: {
    'matching-return-type': matchingReturnType,
    'matching-resolve-field-parent-type': matchingResolveFieldParentType,
    'require-resolve-field-for-nested-models': requireResolveFieldForNestedModels,
  },
}
