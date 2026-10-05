export const documentTypes={pdf:'application/pdf',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
export function validateDocument(file){
 const ext=file.name.split('.').pop().toLowerCase();
 if(!documentTypes[ext])throw Error('Escolha um arquivo PDF ou Excel (.xls ou .xlsx).');
 if(!file.size||file.size>52428800)throw Error('O arquivo deve ter conteúdo e no máximo 50 MB.');
 if(file.name.length>255)throw Error('O nome do arquivo deve ter até 255 caracteres.');
 return {ext,contentType:documentTypes[ext]};
}
