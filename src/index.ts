import { rule as matchingArgsType } from './matching-args-type.rule'
import { rule as matchingFieldType } from './matching-field-type.rule'
import { rule as matchingResolveFieldParentType } from './matching-resolve-field-parent-type.rule'
import { rule as matchingReturnType } from './matching-return-type.rule'
import { rule as namingConvention } from './naming-convention.rule'
import { rule as noOptionalFieldsInObjectType } from './no-optional-fields-in-object-type.rule'
import { rule as noRedundantFieldDecorator } from './no-redundant-field-decorator.rule'
import { rule as requireResolveFieldForNestedModels } from './require-resolve-field-for-nested-models.rule'
import { rule as requireResolverTypeArgWithResolveField } from './require-resolver-type-arg-with-resolve-field.rule'

module.exports = {
  rules: {
    'matching-args-type': matchingArgsType,
    'matching-field-type': matchingFieldType,
    'matching-return-type': matchingReturnType,
    'matching-resolve-field-parent-type': matchingResolveFieldParentType,
    'naming-convention': namingConvention,
    'no-optional-fields-in-object-type': noOptionalFieldsInObjectType,
    'no-redundant-field-decorator': noRedundantFieldDecorator,
    'require-resolve-field-for-nested-models':
      requireResolveFieldForNestedModels,
    'require-resolver-type-arg-with-resolve-field':
      requireResolverTypeArgWithResolveField,
  },
}
