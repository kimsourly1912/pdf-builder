export type RecipientRole = {
  id: string;
  name: string;
  color: string;
};

export type TemplatePageEntry = {
  id: string;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
};

export type TemplateAnnotation = {
  id: string;
  page: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  recipientRoleId?: string;
  fieldKey?: string;
  labelBinding?: import("@/features/templates/label-binding").LabelBinding;
  [key: string]: unknown;
};

export type TemplateFillPayload = {
  template: {
    id: string;
    name: string;
    description: string;
    fileName: string;
    annotations: TemplateAnnotation[];
    pageOrder: TemplatePageEntry[];
  };
  recipient: RecipientRole;
};
