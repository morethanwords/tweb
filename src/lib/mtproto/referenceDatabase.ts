class ReferenceDatabase {

}

const referenceDatabase = new ReferenceDatabase();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).referenceDatabase = referenceDatabase;
}
export default referenceDatabase;