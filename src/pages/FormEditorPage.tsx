import React from 'react';
import { useParams } from 'react-router-dom';
import UnifiedEditor from '../components/editor/UnifiedEditor';

const FormEditorPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  return <UnifiedEditor formId={formId} />;
};

export default FormEditorPage;