// src/hooks/use-protocol-translations.ts
import { useI18n } from '@/contexts/i18n-context';
import { useMemo } from 'react';

/**
 * Hook to translate protocol fields based on current language
 * Assumes protocol items have structure: { label: { "pt": "...", "en": "...", "es": "..." } }
 * or a simple string for backward compatibility
 */
export function useProtocolTranslations() {
  const { currentLanguage } = useI18n();

  const translateField = useMemo(() => {
    return (field: any): string => {
      if (!field) return '';
      
      // If field is already a string, return it (backward compatibility)
      if (typeof field === 'string') return field;
      
      // If field is an object with translations
      if (typeof field === 'object' && field !== null) {
        // Try current language first
        if (field[currentLanguage]) return field[currentLanguage];
        
        // Fallback to pt
        if (field['pt']) return field['pt'];
        
        // Fallback to any available language
        const firstKey = Object.keys(field)[0];
        if (firstKey) return field[firstKey];
      }
      
      return '';
    };
  }, [currentLanguage]);

  const translateProtocol = useMemo(() => {
    return (protocol: any) => {
      if (!protocol) return protocol;

      return {
        ...protocol,
        title: translateField(protocol.title),
        description: translateField(protocol.description),
        sections: protocol.sections?.map((section: any) => ({
          ...section,
          title: translateField(section.title),
          desc: translateField(section.desc),
          fields: section.fields?.map((field: any) => ({
            ...field,
            label: translateField(field.label),
            placeholder: translateField(field.placeholder),
            helper_text: translateField(field.helper_text),
            desc: translateField(field.desc),
            options: field.options?.map((opt: any) => {
              // New format: { value, label: { pt, en, es }, desc: { pt, en, es } }
              if (typeof opt === 'object' && opt !== null && opt.value !== undefined && typeof opt.label === 'object') {
                return {
                  value: opt.value,
                  label: translateField(opt.label),
                  desc: opt.desc ? translateField(opt.desc) : undefined,
                };
              }
              // If option is an object with a string label (already translated)
              if (typeof opt === 'object' && opt !== null && (opt.key || opt.label)) {
                return {
                  ...opt,
                };
              }
              // Old format: { pt, en, es, desc: {pt,en,es} }
              if (typeof opt === 'object' && opt !== null && opt.desc) {
                return {
                  label: translateField(opt),
                  desc: translateField(opt.desc),
                };
              }
              // Legacy: simple translation object or string
              return translateField(opt);
            }),
            config: field.config ? {
              ...field.config,
              helper_text: translateField(field.config.helper_text),
              height_classes: field.config.height_classes?.map((hc: any) => ({
                ...hc,
                label: translateField(hc.label),
                desc: translateField(hc.desc)
              })),
              cover_classes: field.config.cover_classes?.map((cc: any) => ({
                ...cc,
                label: translateField(cc.label),
                name: translateField(cc.name),
                desc: translateField(cc.desc)
              })),
              life_forms: field.config.life_forms ? {
                woody: field.config.life_forms.woody?.map((lf: any) => ({
                  ...lf,
                  name: translateField(lf.name),
                  desc: translateField(lf.desc)
                })),
                herbaceous: field.config.life_forms.herbaceous?.map((lf: any) => ({
                  ...lf,
                  name: translateField(lf.name),
                  desc: translateField(lf.desc)
                })),
                special: field.config.life_forms.special?.map((lf: any) => ({
                  ...lf,
                  name: translateField(lf.name),
                  desc: translateField(lf.desc)
                }))
              } : undefined,
              magnitude_options: field.config.magnitude_options?.map((opt: any) => translateField(opt))
            } : undefined,
            classes: field.classes?.map((cls: any) => translateField(cls)),
            items: field.items?.map((item: any) => ({
              ...item,
              label: translateField(item.label)
            }))
          }))
        }))
      };
    };
  }, [translateField]);

  return { translateProtocol, translateField };
}
