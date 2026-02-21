import { createFormHook, createFormHookContexts } from '@tanstack/react-form'

const { fieldContext, formContext } = createFormHookContexts()

const { useAppForm } = createFormHook({
  fieldComponents: {
    InputField: ({ field }) => (
      <input
        type="text"
        value={field.value}
        onChange={(e) => field.setValue(e.target.value)}
      />
    ),
  },
  formComponents: {},
  fieldContext,
  formContext,
})

export {
  useAppForm,
}
