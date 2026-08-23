import type { FieldSchema, LocalizedString } from "@/protocol-kernel/types";

// Fields that live directly on the `points` row (photos, additional_notes,
// audio_notes, point_size), not inside any module's data - so they don't
// belong in any ModuleSchema. Kept here as plain FieldSchema objects so the
// survey form can still render them via the same generic field row used for
// module data (core/fields/GenericFieldRow.tsx), reading/writing a small
// `pointFields` dict instead of a module's `moduleValues` entry. Ported from
// the legacy assets/protocols/paisageo/paisageo_protocol.json (Fase 2 of the
// plugin-architecture migration).

export const POINT_SIZE_FIELD: FieldSchema = {
  id: "point_size",
  label: { pt: "Área (m²) do ponto de observação", en: "Area (m²) of the observation point", es: "Superficie (m²) del punto de observación", fr: "Superficie (m²) du point d'observation" },
  type: "number",
  required: true,
  min: 0,
  hideRangeHint: true,
  description: { pt: "Área total da parcela observada em campo, em metros quadrados. A parcela é a unidade espacial mínima de coleta e deve ser homogênea em termos de vegetação e ambiente. Para levantamentos detalhados, recomenda-se parcelas entre 100 m² e 2.500 m², dependendo da escala do estudo.", en: "Total area of the observed plot in the field, in square meters. The plot is the minimum spatial unit of collection and must be homogeneous in terms of vegetation and environment. For detailed surveys, plots between 100 m² and 2,500 m² are recommended, depending on the study scale.", es: "Área total de la parcela observada en campo, en metros cuadrados. La parcela es la unidad espacial mínima de recolección y debe ser homogénea en términos de vegetación y ambiente. Para levantamientos detallados, se recomiendan parcelas entre 100 m² y 2.500 m², según la escala del estudio.", fr: "Superficie totale de la parcelle observée sur le terrain, en mètres carrés. La parcelle est l'unité spatiale minimale de collecte et doit être homogène en termes de végétation et d'environnement. Pour des relevés détaillés, des parcelles entre 100 m² et 2 500 m² sont recommandées, selon l'échelle d'étude." },
};

export const PHOTOS_FIELD: FieldSchema = {
  id: "photos",
  label: { pt: "Fotos do Ponto de Coleta", en: "Plot Photos", es: "Fotos del Punto de Recoleción", fr: "Photos du Point de Collecte" },
  type: "photo",
  renderAs: "photo_input",
  description: { pt: "Tire fotos ou selecione da galeria.", en: "Take photos or select from gallery.", es: "Tome fotos o seleccione de la galería.", fr: "Prenez des photos ou sélectionnez depuis la galerie." },
};

export const ADDITIONAL_NOTES_FIELD: FieldSchema = {
  id: "additional_notes",
  label: { pt: "Observações de Campo", en: "Field Observations", es: "Observaciones de Campo", fr: "Observations de Terrain" },
  type: "notes",
  renderAs: "notes_list",
};

export const AUDIO_NOTES_FIELD: FieldSchema = {
  id: "audio_notes",
  label: { pt: "Notas de Áudio", en: "Audio Notes", es: "Notas de Audio", fr: "Notes Audio" },
  type: "audio",
  renderAs: "audio_notes_input",
  description: { pt: "Grave notas de áudio para descrever detalhes do campo.", en: "Record audio notes to describe field details.", es: "Grabe notas de audio para describir detalles del campo.", fr: "Enregistrez des notes audio pour décrire les détails de terrain." },
};

export const SPECIES_FIELD: FieldSchema = {
  id: "veg_species",
  label: { pt: "Registro Florístico", en: "Floristic Record", es: "Registro Florístico", fr: "Relevé Floristique" },
  type: "species",
  renderAs: "species_list",
  description: { pt: "Registro qualitativo das espécies vegetais identificadas na parcela. Funciona como dado complementar ao código fisionômico da Matriz de Küchler, conferindo conteúdo florístico ao registro estrutural. Podem ser inseridos nomes científicos completos (gênero e espécie) ou nomes populares quando a identificação taxonômica não for possível em campo.", en: "Qualitative record of plant species identified in the plot. Functions as complementary data to the Küchler Matrix physiognomic code, adding floristic content to the structural record. Full scientific names (genus and species) or common names may be entered when taxonomic identification is not possible in the field.", es: "Registro cualitativo de las especies vegetales identificadas en la parcela. Funciona como dato complementario al código fisionómico de la Matriz de Küchler, aportando contenido florístico al registro estructural. Se pueden ingresar nombres científicos completos (género y especie) o nombres comunes cuando la identificación taxonómica no sea posible en campo.", fr: "Relevé qualitatif des espèces végétales identifiées dans la parcelle. Complète le code physionomique de la Matrice de Küchler en y ajoutant un contenu floristique. Les noms scientifiques complets (genre et espèce) ou les noms communs peuvent être saisis lorsque l'identification taxonomique n'est pas possible sur le terrain." },
};

export const PLOT_SIZE_SECTION_TITLE: LocalizedString = { pt: "Tamanho da Parcela", en: "Plot Size", es: "Superficie de la Parcela", fr: "Taille de la Parcelle" };
export const PHOTOS_SECTION_TITLE: LocalizedString = { pt: "Fotos", en: "Photos", es: "Fotos", fr: "Photos" };
export const NOTES_SECTION_TITLE: LocalizedString = { pt: "Notas Adicionais", en: "Additional Notes", es: "Notas Adicionales", fr: "Notes Complémentaires" };
export const FLORA_SECTION_TITLE: LocalizedString = { pt: "Levantamento Florístico", en: "Floristic Survey", es: "Levantamiento Florístico", fr: "Relevé Floristique" };
